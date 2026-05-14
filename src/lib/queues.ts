import { Queue } from 'bullmq';
import { redis } from './redis';

// ─── Job payload types ────────────────────────────────────────────────────────

export interface ScrapeJobPayload {
  companyId: string;
  website: string;
}

export interface SendJobPayload {
  companyId: string;
  outreachId: string;
  /** Delay in ms applied by BullMQ before the job becomes active */
  delayMs: number;
  /** Filename inside public/uploads/ — forwarded to nodemailer as attachment */
  attachmentName?: string;
}

export interface MapsScrapeJobPayload {
  query: string;
  num: number;
  gl: string;
  /** '2gis' | 'yandex_maps' | 'both' — Playwright scraper (no API key needed)
   *  'google_places' — falls back to the API-based maps-search.ts */
  engine: '2gis' | 'yandex_maps' | 'google_places' | 'both';
}

// ─── Queue instances ──────────────────────────────────────────────────────────

export const scrapeQueue = new Queue<ScrapeJobPayload>('scrape', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export const sendQueue = new Queue<SendJobPayload>('send', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export const mapsScrapeQueue = new Queue<MapsScrapeJobPayload>('maps-scrape', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

// ─── Typed enqueue helpers (called from API routes) ───────────────────────────

/**
 * Enqueue a scrape job for a single company.
 * Returns the BullMQ job ID.
 */
export async function enqueueScrape(payload: ScrapeJobPayload): Promise<string> {
  const job = await scrapeQueue.add('scrape_company', payload, {
    jobId: `scrape-${payload.companyId}`,
    // Deduplicate: if a job with this ID already exists and is active/waiting,
    // BullMQ will skip adding a duplicate.
  });
  return job.id!;
}

/**
 * Enqueue a single send job.
 *
 * @param payload       - job data (companyId, outreachId, attachmentName?)
 * @param explicitDelay - use this exact delay in ms (for batch sends with pre-computed
 *                        staggered timing). When omitted a random delay in [minMs, maxMs]
 *                        is generated automatically.
 * @param minMs         - minimum random delay (default 3 min)
 * @param maxMs         - maximum random delay (default 8 min)
 */
export async function enqueueSend(
  payload: Omit<SendJobPayload, 'delayMs'>,
  explicitDelay?: number,
  minMs = 3 * 60_000,
  maxMs = 8 * 60_000,
): Promise<{ jobId: string; delayMs: number }> {
  const delayMs =
    explicitDelay ?? Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

  const job = await sendQueue.add(
    'send_email',
    { ...payload, delayMs } satisfies SendJobPayload,
    {
      delay: delayMs,
      jobId: `send-${payload.outreachId}`,
    },
  );

  return { jobId: job.id!, delayMs };
}

/**
 * Enqueue a maps-scrape job for a search query.
 */
export async function enqueueMapsScrape(payload: MapsScrapeJobPayload): Promise<string> {
  const job = await mapsScrapeQueue.add('scrape_maps', payload);
  return job.id!;
}
