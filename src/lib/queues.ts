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

export interface CatalogImportPayload {
  source: 'apiba';
  pageStart: number;
  pageEnd: number;
  pageSize?: number;
  oked?: string[];
  kato?: number[];
  tax?: {
    comparison: number;
    value: string;
    year: number;
  };
}

export interface MapsScrapeJobPayload {
  query: string;
  num: number;
  gl: string;
  /** '2gis' | 'yandex_maps' | 'both' — Playwright scraper (no API key needed)
   *  'google_places' — falls back to the API-based maps-search.ts */
  engine: '2gis' | 'yandex_maps' | 'google_places' | 'both';
}

// ─── Lazy Queue instances (created on first use, not at import time) ──────────
// Avoids Redis connection attempts during Next.js build / static generation.

let _scrapeQueue: Queue<ScrapeJobPayload> | null = null;
let _sendQueue: Queue<SendJobPayload> | null = null;
let _mapsScrapeQueue: Queue<MapsScrapeJobPayload> | null = null;
let _catalogImportQueue: Queue<CatalogImportPayload> | null = null;

const defaultJobOpts = {
  scrape: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  send: {
    attempts: 3,
    backoff: { type: 'fixed' as const, delay: 60_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  maps: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 15_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
};

function getScrapeQueue(): Queue<ScrapeJobPayload> {
  if (!_scrapeQueue) {
    _scrapeQueue = new Queue<ScrapeJobPayload>('scrape', {
      connection: redis,
      defaultJobOptions: defaultJobOpts.scrape,
    });
  }
  return _scrapeQueue;
}

function getSendQueue(): Queue<SendJobPayload> {
  if (!_sendQueue) {
    _sendQueue = new Queue<SendJobPayload>('send', {
      connection: redis,
      defaultJobOptions: defaultJobOpts.send,
    });
  }
  return _sendQueue;
}

function getMapsScrapeQueue(): Queue<MapsScrapeJobPayload> {
  if (!_mapsScrapeQueue) {
    _mapsScrapeQueue = new Queue<MapsScrapeJobPayload>('maps-scrape', {
      connection: redis,
      defaultJobOptions: defaultJobOpts.maps,
    });
  }
  return _mapsScrapeQueue;
}

function getCatalogImportQueue(): Queue<CatalogImportPayload> {
  if (!_catalogImportQueue) {
    _catalogImportQueue = new Queue<CatalogImportPayload>('catalog-import', {
      connection: redis,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _catalogImportQueue;
}

// ─── Typed enqueue helpers (called from API routes) ───────────────────────────

export async function enqueueScrape(payload: ScrapeJobPayload): Promise<string> {
  const job = await getScrapeQueue().add('scrape_company', payload, {
    jobId: `scrape-${payload.companyId}`,
  });
  return job.id!;
}

export async function enqueueSend(
  payload: Omit<SendJobPayload, 'delayMs'>,
  explicitDelay?: number,
  minMs = 3 * 60_000,
  maxMs = 8 * 60_000,
): Promise<{ jobId: string; delayMs: number }> {
  const delayMs =
    explicitDelay ?? Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

  const job = await getSendQueue().add(
    'send_email',
    { ...payload, delayMs } satisfies SendJobPayload,
    {
      delay: delayMs,
      jobId: `send-${payload.outreachId}`,
    },
  );

  return { jobId: job.id!, delayMs };
}

export async function enqueueMapsScrape(payload: MapsScrapeJobPayload): Promise<string> {
  const job = await getMapsScrapeQueue().add('scrape_maps', payload);
  return job.id!;
}

// ─── Re-export getters for workers (workers need to pass queue instances to Workers) ─

export async function enqueueCatalogImport(payload: CatalogImportPayload): Promise<string> {
  const job = await getCatalogImportQueue().add('catalog_import', payload);
  return job.id!;
}

export { getScrapeQueue, getSendQueue, getMapsScrapeQueue, getCatalogImportQueue };
