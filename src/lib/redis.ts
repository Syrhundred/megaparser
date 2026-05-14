import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Shared ioredis connection. BullMQ requires maxRetriesPerRequest: null.
// Re-use a single instance across the process (queues + workers).
const globalForRedis = globalThis as unknown as { redis: IORedis | undefined };

export const redis =
  globalForRedis.redis ??
  new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
