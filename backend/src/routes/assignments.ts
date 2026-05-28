import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Assignment } from '../models/Assignment';
import { GeneratedPaper, GenerationInput, generateQuestionPaper } from '../lib/gemini';

const router = Router();

type MemoryAssignment = {
  _id: string;
  id: string;
  title: string;
  subject: string;
  className: string;
  dueDate: string;
  totalMarks: number;
  duration: number;
  questionTypes: GenerationInput['questionTypes'];
  additionalInstructions?: string;
  uploadedFileName?: string;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed';
  jobError?: string;
  generatedPaper?: GeneratedPaper;
  createdAt: string;
  updatedAt: string;
  totalQuestions: number;
};

const globalWithMemory = globalThis as typeof globalThis & {
  vedaMemoryAssignments?: Map<string, MemoryAssignment>;
};

const memoryAssignments = globalWithMemory.vedaMemoryAssignments || new Map<string, MemoryAssignment>();
globalWithMemory.vedaMemoryAssignments = memoryAssignments;

function useMemoryStore() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  return !!process.env.VERCEL && (!uri || uri.includes('localhost') || uri.includes('127.0.0.1'));
}

function publicMemoryAssignment(assignment: MemoryAssignment, includePaper = true) {
  if (includePaper) return assignment;
  const { generatedPaper: _generatedPaper, ...summary } = assignment;
  return summary;
}

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
  if (useMemoryStore()) {
    const assignments = Array.from(memoryAssignments.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((assignment) => publicMemoryAssignment(assignment, false));
    return res.json({ success: true, data: assignments });
  }

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
  if (useMemoryStore()) {
    const assignment = memoryAssignments.get(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    return res.json({ success: true, data: assignment });
  }

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

    if (useMemoryStore()) {
      const now = new Date().toISOString();
      const paper = await generateQuestionPaper(input);
      const id = randomUUID();
      const assignment: MemoryAssignment = {
        _id: id,
        id,
        title: title.trim(),
        subject: input.subject,
        className: input.className,
        dueDate: new Date(dueDate).toISOString(),
        totalMarks: input.totalMarks,
        duration: input.duration,
        questionTypes: input.questionTypes,
        additionalInstructions: input.additionalInstructions,
        uploadedFileName,
        jobStatus: 'completed',
        generatedPaper: paper,
        createdAt: now,
        updatedAt: now,
        totalQuestions: input.questionTypes.reduce((sum, qt) => sum + qt.count, 0),
      };

      memoryAssignments.set(id, assignment);
      return res.status(201).json({ success: true, data: assignment });
    }

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
  if (useMemoryStore()) {
    const deleted = memoryAssignments.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    return res.json({ success: true, message: 'Assignment deleted' });
  }

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
  if (useMemoryStore()) {
    const assignment = memoryAssignments.get(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    const input: GenerationInput = {
      subject: assignment.subject,
      className: assignment.className,
      totalMarks: assignment.totalMarks,
      duration: assignment.duration,
      questionTypes: assignment.questionTypes,
      additionalInstructions: assignment.additionalInstructions,
    };

    const paper = await generateQuestionPaper(input);
    assignment.generatedPaper = paper;
    assignment.jobStatus = 'completed';
    assignment.jobError = undefined;
    assignment.updatedAt = new Date().toISOString();
    memoryAssignments.set(assignment._id, assignment);
    return res.json({ success: true, data: assignment, paper });
  }

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
