import { Router, Request, Response } from 'express';
import { Assignment } from '../models/Assignment';
import { generateQuestionPaper, generateMockPaper } from '../lib/gemini';

const router = Router();

// Helper: get Socket.IO emit function only when available (non-Vercel)
async function tryEmit(assignmentId: string, event: string, data: unknown) {
  if (process.env.VERCEL) return;
  try {
    const { emitToAssignment } = await import('../lib/socket');
    emitToAssignment(assignmentId, event, data);
  } catch { /* Socket not available */ }
}

async function tryBroadcast(event: string, data: unknown) {
  if (process.env.VERCEL) return;
  try {
    const { broadcast } = await import('../lib/socket');
    broadcast(event, data);
  } catch { /* Socket not available */ }
}

// GET /api/assignments - list all assignments
router.get('/', async (_req: Request, res: Response) => {
  try {
    const assignments = await Assignment.find()
      .select('-generatedPaper')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: assignments });
  } catch (err) {
    console.error('List assignments error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
  }
});

// GET /api/assignments/:id - get single assignment with paper
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

// POST /api/assignments - create new assignment
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title, subject, className, dueDate, totalMarks, duration,
      questionTypes, additionalInstructions, uploadedFileName, contentText,
    } = req.body;

    // Validation
    if (!title || !subject || !className || !dueDate || !questionTypes?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, subject, className, dueDate, questionTypes',
      });
    }
    if (questionTypes.some((qt: { count: number; marks: number }) => qt.count <= 0 || qt.marks <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Question count and marks must be positive numbers',
      });
    }

    const calculatedTotal = questionTypes.reduce(
      (sum: number, qt: { count: number; marks: number }) => sum + qt.count * qt.marks, 0
    );

    const assignment = new Assignment({
      title, subject, className,
      dueDate: new Date(dueDate),
      totalMarks: totalMarks || calculatedTotal,
      duration: duration || 45,
      questionTypes,
      additionalInstructions,
      uploadedFileName,
      jobStatus: 'pending',
    });
    await assignment.save();

    const assignmentId = (assignment._id as { toString(): string }).toString();
    await tryBroadcast('assignment:created', {
      _id: assignmentId, title, subject, className, dueDate,
      jobStatus: 'pending', createdAt: assignment.createdAt,
    });

    const isVercel = !!process.env.VERCEL;

    if (isVercel) {
      // ── VERCEL: generate synchronously before responding ──────────────────
      // (Vercel serverless functions can't do background work after res.send)
      try {
        assignment.jobStatus = 'processing';
        await assignment.save();

        const input = {
          subject, className,
          totalMarks: totalMarks || calculatedTotal,
          duration: duration || 45,
          questionTypes, additionalInstructions, contentText,
        };

        let paper;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your_gemini_api_key_here') {
          paper = generateMockPaper(input);
        } else {
          paper = await generateQuestionPaper(input);
        }

        assignment.generatedPaper = paper;
        assignment.jobStatus = 'completed';
        await assignment.save();

        return res.status(201).json({
          success: true,
          data: { _id: assignmentId, title, jobStatus: 'completed', createdAt: assignment.createdAt },
        });
      } catch (genErr: unknown) {
        const errorMessage = genErr instanceof Error ? genErr.message : 'Generation failed';
        assignment.jobStatus = 'failed';
        assignment.jobError = errorMessage;
        await assignment.save();
        return res.status(201).json({
          success: true,
          data: { _id: assignmentId, title, jobStatus: 'failed', createdAt: assignment.createdAt },
        });
      }
    } else {
      // ── LOCAL: fire-and-forget async processing ────────────────────────────
      res.status(201).json({
        success: true,
        data: { _id: assignmentId, title, jobStatus: 'pending', createdAt: assignment.createdAt },
      });

      // Try BullMQ first
      let jobQueued = false;
      try {
        const { getQueue } = await import('../lib/redis');
        const queue = getQueue();
        if (queue) {
          await queue.add('generate-questions', { assignmentId, contentText });
          assignment.jobStatus = 'pending';
          await assignment.save();
          jobQueued = true;
        }
      } catch { /* no queue */ }

      if (!jobQueued) {
        processInline(
          assignmentId, subject, className,
          totalMarks || calculatedTotal, duration || 45,
          questionTypes, additionalInstructions, contentText
        ).catch(console.error);
      }
    }
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ success: false, error: 'Failed to create assignment' });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    await tryBroadcast('assignment:deleted', { _id: req.params.id });
    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete assignment' });
  }
});

// PATCH /api/assignments/:id/regenerate
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

    const assignmentId = (assignment._id as { toString(): string }).toString();
    const isVercel = !!process.env.VERCEL;

    const input = {
      subject: assignment.subject,
      className: assignment.className,
      totalMarks: assignment.totalMarks,
      duration: assignment.duration,
      questionTypes: assignment.questionTypes,
      additionalInstructions: assignment.additionalInstructions,
    };

    if (isVercel) {
      // Synchronous on Vercel
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const paper = (!apiKey || apiKey === 'your_gemini_api_key_here')
          ? generateMockPaper(input)
          : await generateQuestionPaper(input);

        assignment.generatedPaper = paper;
        assignment.jobStatus = 'completed';
        await assignment.save();
        return res.json({ success: true, message: 'Regeneration complete', paper });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed';
        assignment.jobStatus = 'failed';
        assignment.jobError = msg;
        await assignment.save();
        return res.json({ success: false, error: msg });
      }
    } else {
      await tryEmit(assignmentId, 'job:progress', { assignmentId, status: 'processing', message: 'Regenerating...' });
      processInline(assignmentId, assignment.subject, assignment.className, assignment.totalMarks, assignment.duration, assignment.questionTypes, assignment.additionalInstructions).catch(console.error);
      return res.json({ success: true, message: 'Regeneration started' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to start regeneration' });
  }
});

// Inline background processing (local only)
async function processInline(
  assignmentId: string, subject: string, className: string,
  totalMarks: number, duration: number,
  questionTypes: { type: string; count: number; marks: number }[],
  additionalInstructions?: string, contentText?: string
) {
  try {
    await Assignment.findByIdAndUpdate(assignmentId, { jobStatus: 'processing' });
    await tryEmit(assignmentId, 'job:progress', { assignmentId, status: 'processing', message: 'AI is generating your question paper...' });

    const input = { subject, className, totalMarks, duration, questionTypes, additionalInstructions, contentText };
    const apiKey = process.env.GEMINI_API_KEY;
    let paper;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      await new Promise(r => setTimeout(r, 2000));
      paper = generateMockPaper(input);
    } else {
      paper = await generateQuestionPaper(input);
    }

    await Assignment.findByIdAndUpdate(assignmentId, { jobStatus: 'completed', generatedPaper: paper });
    await tryEmit(assignmentId, 'job:complete', { assignmentId, status: 'completed', paper });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await Assignment.findByIdAndUpdate(assignmentId, { jobStatus: 'failed', jobError: msg });
    await tryEmit(assignmentId, 'job:failed', { assignmentId, status: 'failed', error: msg });
  }
}

export default router;
