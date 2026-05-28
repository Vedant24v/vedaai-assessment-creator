import { Router, Request, Response } from 'express';
import { Assignment } from '../models/Assignment';
import { getQueue } from '../lib/redis';
import { emitToAssignment, broadcast } from '../lib/socket';
import { generateQuestionPaper, generateMockPaper } from '../lib/gemini';


const router = Router();

// GET /api/assignments - list all assignments
router.get('/', async (_req: Request, res: Response) => {
  try {
    const assignments = await Assignment.find()
      .select('-generatedPaper')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: assignments });
  } catch (err) {
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
    res.status(500).json({ success: false, error: 'Failed to fetch assignment' });
  }
});

// POST /api/assignments - create new assignment
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      subject,
      className,
      dueDate,
      totalMarks,
      duration,
      questionTypes,
      additionalInstructions,
      uploadedFileName,
      contentText,
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
      (sum: number, qt: { count: number; marks: number }) => sum + qt.count * qt.marks,
      0
    );

    const assignment = new Assignment({
      title,
      subject,
      className,
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

    // Try to enqueue BullMQ job
    let jobQueued = false;
    try {
      const queue = getQueue();
      if (queue) {
        const job = await queue.add('generate-questions', {
          assignmentId,
          contentText,
        });
        assignment.jobId = job.id?.toString();
        assignment.jobStatus = 'pending';
        await assignment.save();
        jobQueued = true;
        console.log(`📥 Job queued: ${job.id} for assignment ${assignmentId}`);
      }
    } catch (queueErr) {
      console.warn('BullMQ not available, processing inline:', queueErr);
    }

    // If no queue available, process inline (fallback)
    if (!jobQueued) {
      processInline(assignmentId, subject, className, totalMarks || calculatedTotal, duration || 45, questionTypes, additionalInstructions, contentText)
        .catch(console.error);
    }

    // Broadcast new assignment to all clients
    broadcast('assignment:created', {
      _id: assignmentId,
      title: assignment.title,
      subject: assignment.subject,
      className: assignment.className,
      dueDate: assignment.dueDate,
      jobStatus: assignment.jobStatus,
      createdAt: assignment.createdAt,
    });

    res.status(201).json({
      success: true,
      data: {
        _id: assignmentId,
        title: assignment.title,
        jobStatus: assignment.jobStatus,
        createdAt: assignment.createdAt,
      },
    });
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
    broadcast('assignment:deleted', { _id: req.params.id });
    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete assignment' });
  }
});

// PATCH /api/assignments/:id/regenerate - trigger regeneration
router.patch('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    assignment.jobStatus = 'pending';
    assignment.generatedPaper = undefined;
    assignment.jobError = undefined;
    await assignment.save();

    const assignmentId = (assignment._id as { toString(): string }).toString();

    // Try queue first, then inline
    let jobQueued = false;
    try {
      const queue = getQueue();
      if (queue) {
        await queue.add('generate-questions', { assignmentId });
        jobQueued = true;
      }
    } catch {
      // no queue
    }

    if (!jobQueued) {
      processInline(
        assignmentId,
        assignment.subject,
        assignment.className,
        assignment.totalMarks,
        assignment.duration,
        assignment.questionTypes,
        assignment.additionalInstructions
      ).catch(console.error);
    }

    emitToAssignment(assignmentId, 'job:progress', {
      assignmentId,
      status: 'pending',
      message: 'Regeneration queued...',
    });

    res.json({ success: true, message: 'Regeneration started' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to start regeneration' });
  }
});

// Inline processing fallback (when Redis/BullMQ not available)
async function processInline(
  assignmentId: string,
  subject: string,
  className: string,
  totalMarks: number,
  duration: number,
  questionTypes: { type: string; count: number; marks: number }[],
  additionalInstructions?: string,
  contentText?: string
) {
  try {
    await Assignment.findByIdAndUpdate(assignmentId, { jobStatus: 'processing' });

    emitToAssignment(assignmentId, 'job:progress', {
      assignmentId,
      status: 'processing',
      message: 'AI is generating your question paper...',
    });

    const input = { subject, className, totalMarks, duration, questionTypes, additionalInstructions, contentText };
    
    let paper;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      // Simulate delay for realistic experience
      await new Promise(r => setTimeout(r, 2000));
      paper = generateMockPaper(input);
    } else {
      paper = await generateQuestionPaper(input);
    }

    await Assignment.findByIdAndUpdate(assignmentId, {
      jobStatus: 'completed',
      generatedPaper: paper,
    });

    emitToAssignment(assignmentId, 'job:complete', {
      assignmentId,
      status: 'completed',
      paper,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await Assignment.findByIdAndUpdate(assignmentId, {
      jobStatus: 'failed',
      jobError: errorMessage,
    });

    emitToAssignment(assignmentId, 'job:failed', {
      assignmentId,
      status: 'failed',
      error: errorMessage,
    });
  }
}

export default router;
