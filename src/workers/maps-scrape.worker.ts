import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { MapsScrapeJobPayload } from '../lib/queues';
import { MapsResult } from '../lib/maps-search';
import { scrapeMaps, ScrapeMapEngine } from '../lib/maps-scraper';
import { searchMaps } from '../lib/maps-search';

/**
 * Route to the correct implementation:
 *  - '2gis' | 'yandex_maps' | 'both' → Playwright scraper (free, no API key)
 *  - 'google_places'                  → API-based fallback (requires key)
 */
async function runMapsSearch(
  query: string,
  num: number,
  gl: string,
  engine: MapsScrapeJobPayload['engine'],
): Promise<MapsResult[]> {
  if (engine === 'google_places') {
    // API-based fallback — read key from DB → env
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['google_api_key'] } },
    });
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    return searchMaps(query, {
      engine: 'google_places',
      num,
      gl,
      googleApiKey: s.google_api_key || process.env.GOOGLE_API_KEY || '',
    });
  }

  // Playwright scraper — '2gis', 'yandex_maps', or 'both'
  return scrapeMaps(query, {
    engine: engine as ScrapeMapEngine,
    num,
    gl,
  });
}

async function processJob(job: Job<MapsScrapeJobPayload>): Promise<void> {
  const { query, num, gl, engine } = job.data;

  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data: { status: 'active', startedAt: new Date(), attempt: job.attemptsMade + 1 },
  });

  console.log(`[maps-scrape] job=${job.id} query="${query}" engine=${engine} gl=${gl}`);

  await job.updateProgress(10);
  const results = await runMapsSearch(query, num, gl, engine);
  await job.updateProgress(60);

  console.log(`[maps-scrape] job=${job.id} found=${results.length} results`);

  // Upsert each result as a Company row
  let saved = 0;
  for (const r of results) {
    // Use website as unique key; fall back to a synthetic maps:// URI
    const websiteKey = r.website ?? `maps://${r.source}/${encodeURIComponent(r.name)}`;

    let status = 'site_found';
    if (r.email)       status = 'email_found';
    else if (r.phone)  status = 'contact_found';

    await prisma.company.upsert({
      where: { website: websiteKey },
      create: {
        name:        r.name,
        website:     websiteKey,
        address:     r.address,
        phone:       r.phone   ?? null,
        email:       r.email   ?? null,
        status,
        searchQuery: query,
      },
      update: {
        // Backfill missing contact fields — never overwrite existing data
        ...(r.phone   ? { phone:   r.phone   } : {}),
        ...(r.email   ? { email:   r.email   } : {}),
        ...(r.address ? { address: r.address } : {}),
      },
    });
    saved++;
  }

  await job.updateProgress(95);

  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data: {
      status:     'completed',
      result:     { found: results.length, saved } as object,
      finishedAt: new Date(),
    },
  });

  await job.updateProgress(100);
  console.log(`[maps-scrape] done job=${job.id} saved=${saved}`);
}

export function createMapsScrapeWorker() {
  const worker = new Worker<MapsScrapeJobPayload>('maps-scrape', processJob, {
    connection: redis,
    concurrency: 1, // one maps job at a time — each already opens multiple pages internally
  });

  worker.on('failed', async (job, err) => {
    console.error(`[maps-scrape] failed job=${job?.id}`, err.message);

    if (job) {
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 2);
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data: {
          status:     isFinal ? 'failed' : 'pending',
          errorMsg:   err.message,
          finishedAt: isFinal ? new Date() : undefined,
        },
      });
    }
  });

  worker.on('error', (err) => {
    console.error('[maps-scrape] worker error', err);
  });

  return worker;
}
