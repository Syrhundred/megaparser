import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { scrapeCompany } from '../lib/scraper';
import { ScrapeJobPayload } from '../lib/queues';

async function processJob(job: Job<ScrapeJobPayload>): Promise<void> {
  const { companyId, website } = job.data;

  // Mark DB Job row as active
  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data: { status: 'active', startedAt: new Date(), attempt: job.attemptsMade + 1 },
  });

  // Let the UI know a scrape is running for this company
  await prisma.company.update({
    where: { id: companyId },
    data: { scrapeJobId: job.id ?? null },
  });

  // Internal placeholder URLs (e.g. from registry import) — nothing to scrape.
  // Keep existing contacts instead of overwriting with no_contacts.
  if (website.startsWith('internal://')) {
    await prisma.job.updateMany({
      where: { bullJobId: job.id },
      data:  { status: 'completed', finishedAt: new Date(), result: { skipped: 'internal_url' } as object },
    });
    await prisma.company.update({
      where: { id: companyId },
      data:  { scrapeJobId: null },
    });
    console.log(`[scrape] skipped internal URL job=${job.id}`);
    return;
  }

  await job.updateProgress(10);
  console.log(`[scrape] job=${job.id} company=${companyId} url=${website}`);

  const result = await scrapeCompany(website);

  await job.updateProgress(80);
  console.log(
    `[scrape] job=${job.id} pages=${result.pagesVisited} ` +
    `emails=${result.emails.length} phones=${result.phones.length} ` +
    `jsRendered=${result.jsRendered}`,
  );

  // Derive status from what was found
  let status: string;
  if (result.emails.length > 0) {
    status = 'email_found';
  } else if (result.phones.length > 0 || result.whatsapp) {
    status = 'contact_found';
  } else if (result.hasForm) {
    status = 'form_found';
  } else {
    status = 'no_contacts';
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      email:          result.emails[0]  ?? null,
      phone:          result.phones[0]  ?? null,
      whatsapp:       result.whatsapp,
      contactPageUrl: result.contactPageUrl,
      hasForm:        result.hasForm,
      // Store all emails as a JSON array for later multi-send use
      allEmails:      result.emails.length > 0 ? JSON.stringify(result.emails) : null,
      status,
      scrapeJobId:    null,
    },
  });

  // Write result back to Job row for audit / UI display
  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data: {
      status:     'completed',
      result:     {
        emails:       result.emails,
        phones:       result.phones,
        whatsapp:     result.whatsapp,
        hasForm:      result.hasForm,
        pagesVisited: result.pagesVisited,
        jsRendered:   result.jsRendered,
      } as object,
      finishedAt: new Date(),
    },
  });

  await job.updateProgress(100);
  console.log(`[scrape] done job=${job.id} status=${status}`);
}

export function createScrapeWorker() {
  const worker = new Worker<ScrapeJobPayload>('scrape', processJob, {
    connection: redis,
    concurrency: 3,
  });

  worker.on('failed', async (job, err) => {
    console.error(`[scrape] failed job=${job?.id}`, err.message);

    if (job) {
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 3);

      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data: {
          status:     isFinal ? 'failed' : 'pending',
          errorMsg:   err.message,
          finishedAt: isFinal ? new Date() : undefined,
        },
      });

      if (isFinal) {
        await prisma.company.update({
          where: { id: job.data.companyId },
          data: { scrapeJobId: null },
        }).catch(() => null);
      }
    }
  });

  worker.on('error', (err) => {
    console.error('[scrape] worker error', err);
  });

  return worker;
}
