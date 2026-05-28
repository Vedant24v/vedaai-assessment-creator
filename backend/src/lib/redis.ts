import Redis from 'ioredis';
import { Queue } from 'bullmq';

let redisClient: Redis;
let questionQueue: Queue;
let redisConnectionString: string;

export async function initRedis(): Promise<void> {
  redisConnectionString = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = new Redis(redisConnectionString, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        console.warn('Redis not available, running without queue support');
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
  });

  redisClient.on('connect', () => console.log('✅ Redis connected'));
  redisClient.on('error', () => {
    // Redis connection errors are expected when Redis is not running
    // The system falls back to inline processing automatically
  });


  // BullMQ uses its own bundled ioredis — pass connection config object, not instance
  questionQueue = new Queue('question-generation', {
    connection: {
      url: redisConnectionString,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  console.log('✅ BullMQ queue initialized');
}

export function getRedis(): Redis {
  return redisClient;
}

export function getQueue(): Queue {
  return questionQueue;
}

export function getRedisConnectionString(): string {
  return redisConnectionString;
}
