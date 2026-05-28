import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import { initRedis, getRedisConnectionString } from '../lib/redis';
import { generateQuestionPaper, generateMockPaper } from '../lib/gemini';
import { Assignment } from '../models/Assignment';
import Redis from 'ioredis';

let publisher: Redis | null = null;

async function start() {
  await connectDB();
  await initRedis();

  const redisUrl = getRedisConnectionString();
  
  try {
    publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    publisher.on('error', () => {}); // Suppress connection errors
  } catch {
    publisher = null;
  }

  const worker = new Worker(
    'question-generation',
    async (job: Job) => {
      const { assignmentId, contentText } = job.data as {
        assignmentId: string;
        contentText?: string;
      };
      
      console.log(`🔄 Processing job ${job.id} for assignment ${assignmentId}`);

      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) {
        throw new Error(`Assignment ${assignmentId} not found`);
      }

      // Update status to processing
      assignment.jobStatus = 'processing';
      await assignment.save();

      // Notify frontend: job started
      await publishEvent(assignmentId, 'job:progress', {
        assignmentId,
        status: 'processing',
        message: 'AI is generating your question paper...',
      });

      const input = {
        subject: assignment.subject,
        className: assignment.className,
        totalMarks: assignment.totalMarks,
        duration: assignment.duration,
        questionTypes: assignment.questionTypes,
        additionalInstructions: assignment.additionalInstructions,
        contentText: contentText?.slice(0, 3000),
      };

      let generatedPaper;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        console.log('⚠️  No Gemini API key - using mock generation');
        await new Promise(r => setTimeout(r, 2000)); // Realistic delay
        generatedPaper = generateMockPaper(input);
      } else {
        generatedPaper = await generateQuestionPaper(input);
      }

      // Save result
      assignment.generatedPaper = generatedPaper;
      assignment.jobStatus = 'completed';
      await assignment.save();

      // Notify frontend: job complete
      await publishEvent(assignmentId, 'job:complete', {
        assignmentId,
        status: 'completed',
        paper: generatedPaper,
      });

      console.log(`✅ Job ${job.id} completed for assignment ${assignmentId}`);
      return { assignmentId, status: 'completed' };
    },
    {
      connection: {
        url: redisUrl,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      concurrency: 2,
    }
  );

  worker.on('failed', async (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
    
    if (job?.data?.assignmentId) {
      const assignmentId = job.data.assignmentId as string;
      try {
        await Assignment.findByIdAndUpdate(assignmentId, {
          jobStatus: 'failed',
          jobError: err.message,
        });

        await publishEvent(assignmentId, 'job:failed', {
          assignmentId,
          status: 'failed',
          error: err.message,
        });
      } catch (updateErr) {
        console.error('Failed to update assignment status:', updateErr);
      }
    }
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  console.log('🚀 Question generation worker started');
}

async function publishEvent(assignmentId: string, event: string, data: unknown) {
  if (publisher) {
    try {
      await publisher.publish('socket-events', JSON.stringify({ event, room: `assignment:${assignmentId}`, data }));
    } catch {
      // Redis pub/sub not available
    }
  }
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});
