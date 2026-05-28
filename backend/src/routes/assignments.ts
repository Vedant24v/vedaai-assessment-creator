import { Router, Request, Response } from 'express';
import { Assignment } from '../models/Assignment';
import { GenerationInput, generateQuestionPaper } from '../lib/gemini';

const router = Router();

async function tryEmit(assignmentId: string, event: string, data: unknown) {
  if (process.env.VERCEL) return;
  try {
    const { emitToAssignment } = await import('../lib/socket');
    emitToAssignment(assignmentId, event, data);
  } catch {
    // Socket.IO is optional outside the local dev server.
  }
}

async function tryBroadcast(event: string, data: unknown) {
  if (process.env.VERCEL) return;
  try {
    const { broadcast } = await import('../lib/socket');
    broadcast(event, data);
  } catch {
    // Socket.IO is optional outside the local dev server.
  }
}

function validateQuestionTypes(questionTypes: unknown): questionTypes is GenerationInput['questionTypes'] {
  return (
    Array.isArray(questionTypes) &&
    questionTypes.length > 0 &&
    questionTypes.every(
      (qt) =>
        qt &&
        typeof qt.type === 'string' &&
        qt.type.trim().length > 0 &&
        Number(qt.count) > 0 &&
        Number(qt.marks) > 0
    )
  );
}

function normalizeQuestionTypes(questionTypes: GenerationInput['questionTypes']) {
  return questionTypes.map((qt) => ({
    type: qt.type.trim(),
    count: Number(qt.count),
    marks: Number(qt.marks),
  }));
}

function buildGenerationInput(body: {
  subject: string;
  className: string;
  totalMarks?: number;
  duration?: number;
  questionTypes: GenerationInput['questionTypes'];
  additionalInstructions?: string;
  contentText?: string;
}): GenerationInput {
  const questionTypes = normalizeQuestionTypes(body.questionTypes);
  const totalMarks =
    Number(body.totalMarks) || questionTypes.reduce((sum, qt) => sum + qt.count * qt.marks, 0);

  return {
    subject: body.subject.trim(),
    className: body.className.trim(),
    totalMarks,
    duration: Number(body.duration) || 45,
    questionTypes,
    additionalInstructions: body.additionalInstructions?.trim() || undefined,
    contentText: body.contentText?.slice(0, 3000) || undefined,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const assignments = await Assignment.find()
      .select('-generatedPaper')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: assignments });
  } catch (err) {
    console.error('List assignments error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    res.json({ success: true, data: assignment });
  } catch (err) {
    console.error('Get assignment error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch assignment' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      subject,
      className,
      dueDate,
      questionTypes,
      additionalInstructions,
      uploadedFileName,
      contentText,
    } = req.body;

    if (!title?.trim() || !subject?.trim() || !className?.trim() || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, subject, className, dueDate',
      });
    }

    if (!validateQuestionTypes(questionTypes)) {
      return res.status(400).json({
        success: false,
        error: 'Add at least one valid question type with positive count and marks',
      });
    }

    const input = buildGenerationInput({
      subject,
      className,
      totalMarks: req.body.totalMarks,
      duration: req.body.duration,
      questionTypes,
      additionalInstructions,
      contentText,
    });

    const assignment = await Assignment.create({
      title: title.trim(),
      subject: input.subject,
      className: input.className,
      dueDate: new Date(dueDate),
      totalMarks: input.totalMarks,
      duration: input.duration,
      questionTypes: input.questionTypes,
      additionalInstructions: input.additionalInstructions,
      uploadedFileName,
      jobStatus: process.env.VERCEL ? 'processing' : 'pending',
    });

    const assignmentId = assignment._id.toString();
    await tryBroadcast('assignment:created', assignment.toObject());

    if (process.env.VERCEL) {
      const paper = await generateQuestionPaper(input);
      assignment.generatedPaper = paper;
      assignment.jobStatus = 'completed';
      assignment.jobError = undefined;
      await assignment.save();

      return res.status(201).json({
        success: true,
        data: assignment,
      });
    }

    res.status(201).json({
      success: true,
      data: assignment,
    });

    let jobQueued = false;
    try {
      const { getQueue } = await import('../lib/redis');
      const queue = getQueue();
      if (queue) {
        await queue.add('generate-questions', { assignmentId, contentText: input.contentText });
        jobQueued = true;
      }
    } catch {
      // Fall back to inline processing below.
    }

    if (!jobQueued) {
      processInline(assignmentId, input).catch(console.error);
    }
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ success: false, error: 'Failed to create assignment' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    await tryBroadcast('assignment:deleted', { _id: req.params.id });
    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete assignment' });
  }
});

router.patch('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    assignment.jobStatus = 'processing';
    assignment.generatedPaper = undefined;
    assignment.jobError = undefined;
    await assignment.save();

    const input: GenerationInput = {
      subject: assignment.subject,
      className: assignment.className,
      totalMarks: assignment.totalMarks,
      duration: assignment.duration,
      questionTypes: normalizeQuestionTypes(assignment.questionTypes),
      additionalInstructions: assignment.additionalInstructions,
    };

    const assignmentId = assignment._id.toString();

    if (process.env.VERCEL) {
      const paper = await generateQuestionPaper(input);
      assignment.generatedPaper = paper;
      assignment.jobStatus = 'completed';
      await assignment.save();
      return res.json({ success: true, data: assignment, paper });
    }

    await tryEmit(assignmentId, 'job:progress', {
      assignmentId,
      status: 'processing',
      message: 'Regenerating question paper...',
    });

    processInline(assignmentId, input).catch(console.error);
    return res.json({ success: true, message: 'Regeneration started', data: assignment });
  } catch (err) {
    console.error('Regenerate assignment error:', err);
    res.status(500).json({ success: false, error: 'Failed to regenerate assignment' });
  }
});

async function processInline(assignmentId: string, input: GenerationInput) {
  try {
    await Assignment.findByIdAndUpdate(assignmentId, {
      jobStatus: 'processing',
      jobError: undefined,
    });
    await tryEmit(assignmentId, 'job:progress', {
      assignmentId,
      status: 'processing',
      message: 'AI is generating your question paper...',
    });

    const paper = await generateQuestionPaper(input);

    await Assignment.findByIdAndUpdate(assignmentId, {
      jobStatus: 'completed',
      generatedPaper: paper,
      jobError: undefined,
    });
    await tryEmit(assignmentId, 'job:complete', { assignmentId, status: 'completed', paper });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await Assignment.findByIdAndUpdate(assignmentId, { jobStatus: 'failed', jobError: msg });
    await tryEmit(assignmentId, 'job:failed', { assignmentId, status: 'failed', error: msg });
  }
}

export default router;
