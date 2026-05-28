import Redis from 'ioredis';
import { Queue } from 'bullmq';

let redisClient: Redis | undefined;
let questionQueue: Queue | undefined;
let redisConnectionString = process.env.REDIS_URL || 'redis://localhost:6379';

export async function initRedis(): Promise<void> {
  redisConnectionString = process.env.REDIS_URL || 'redis://localhost:6379';

  const client = new Redis(redisConnectionString, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: () => null,
  });

  client.on('error', () => {
    // Redis is optional locally; inline generation is used when unavailable.
  });

  try {
    await client.connect();
    await client.ping();
    const info = await client.info('server');
    const version = info.match(/redis_version:(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
    if (!version || version[0] < 5) {
      redisClient = undefined;
      questionQueue = undefined;
      client.disconnect();
      console.warn(`Redis ${version?.join('.') || 'unknown'} detected, but BullMQ requires Redis 5+. Running inline generation.`);
      return;
    }
  } catch {
    redisClient = undefined;
    questionQueue = undefined;
    client.disconnect();
    console.warn('Redis not available, running without queue support');
    return;
  }

  redisClient = client;
  questionQueue = new Queue('question-generation', {
    connection: {
      url: redisConnectionString,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  console.log('Redis and BullMQ queue initialized');
}

export function getRedis(): Redis | undefined {
  return redisClient;
}

export function getQueue(): Queue | undefined {
  return questionQueue;
}

export function getRedisConnectionString(): string {
  return redisConnectionString;
}
