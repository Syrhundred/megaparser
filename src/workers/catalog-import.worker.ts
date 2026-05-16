import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { CatalogImportPayload } from '../lib/queues';

const APIBA_LIST_URL  = 'https://apiba.prgapp.kz/GetCompanyListAsync';
const APIBA_DETAIL_URL = 'https://apiba.prgapp.kz/CompanyFullInfo';
const DELAY_MS = 120; // ms between detail requests — be polite to the API

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ApibaListResult {
  bin: string;
  titleRu: string;
  addressRu?: string;
  primaryOKED?: string;
}

interface ApibaListResponse {
  pages: number;
  results: ApibaListResult[];
}

interface ApibaContactInfo {
  phone?: { value: string }[] | null;
  website?: string | null;
  email?: string | null;
}

interface ApibaDetailResponse {
  basicInfo?: {
    titleRu?: { value?: string };
    addressRu?: { value?: string };
    primaryOKED?: { value?: string };
    bin?: string;
  };
  gosZakupContacts?: ApibaContactInfo;
  userContacts?: ApibaContactInfo;
}

function extractContacts(detail: ApibaDetailResponse) {
  // Prefer gosZakup contacts (from government procurement portal), fall back to userContacts
  const src = detail.gosZakupContacts ?? detail.userContacts;
  return {
    phone:   src?.phone?.[0]?.value?.trim() || null,
    email:   src?.email?.trim() || null,
    website: src?.website?.trim() || null,
  };
}

async function processApiba(job: Job<CatalogImportPayload>) {
  const { pageStart, pageEnd, pageSize = 100 } = job.data;
  const totalPages = pageEnd - pageStart + 1;

  let imported = 0;
  let updated  = 0;
  let skipped  = 0;

  for (let page = pageStart; page <= pageEnd; page++) {
    console.log(`[catalog-import] apiba page ${page}/${pageEnd}`);

    const listRes = await fetch(APIBA_LIST_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ page, pageSize }),
    });

    if (!listRes.ok) {
      console.error(`[catalog-import] list fetch failed: ${listRes.status}`);
      continue;
    }

    const listData: ApibaListResponse = await listRes.json();

    for (const company of listData.results) {
      await sleep(DELAY_MS);

      let contacts = { phone: null as string | null, email: null as string | null, website: null as string | null };
      let name = company.titleRu;
      let address = company.addressRu ?? null;

      try {
        const detailRes = await fetch(`${APIBA_DETAIL_URL}?id=${company.bin}&lang=ru`);
        if (detailRes.ok) {
          const detail: ApibaDetailResponse = await detailRes.json();
          contacts = extractContacts(detail);
          name    = detail.basicInfo?.titleRu?.value ?? name;
          address = detail.basicInfo?.addressRu?.value ?? address;
        }
      } catch (err) {
        console.warn(`[catalog-import] detail fetch failed for ${company.bin}:`, err);
      }

      // Use real website if available, otherwise use internal placeholder keyed by BIN
      const websiteUrl = contacts.website ?? `internal://bin/${company.bin}`;

      const status = contacts.email   ? 'email_found'
                   : contacts.phone   ? 'contact_found'
                   : 'site_found';

      try {
        const existing = await prisma.company.findUnique({ where: { website: websiteUrl } });

        if (existing) {
          // Update contacts if we now have better data
          if (contacts.phone || contacts.email) {
            await prisma.company.update({
              where: { id: existing.id },
              data: {
                phone:  contacts.phone  ?? existing.phone,
                email:  contacts.email  ?? existing.email,
                status: contacts.email  ? 'email_found'
                      : contacts.phone  ? 'contact_found'
                      : existing.status,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await prisma.company.create({
            data: {
              name,
              website:     websiteUrl,
              phone:       contacts.phone,
              email:       contacts.email,
              address,
              description: company.primaryOKED ?? null,
              status,
              searchQuery: `apiba:bin:${company.bin}`,
            },
          });
          imported++;
        }
      } catch (err) {
        console.warn(`[catalog-import] db error for ${company.bin}:`, err);
        skipped++;
      }
    }

    const progress = Math.round(((page - pageStart + 1) / totalPages) * 100);
    await job.updateProgress(progress);
  }

  return { imported, updated, skipped };
}

export function createCatalogImportWorker() {
  const worker = new Worker<CatalogImportPayload>(
    'catalog-import',
    async (job) => {
      // Mark DB Job row as active
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'active', startedAt: new Date(), attempt: job.attemptsMade + 1 },
      });

      let result: { imported: number; updated: number; skipped: number };

      if (job.data.source === 'apiba') {
        result = await processApiba(job);
      } else {
        throw new Error(`Unknown catalog source: ${job.data.source}`);
      }

      console.log(`[catalog-import] done: imported=${result.imported} updated=${result.updated} skipped=${result.skipped}`);

      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'completed', finishedAt: new Date(), result: result as object },
      });

      return result;
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'failed', finishedAt: new Date(), errorMsg: err.message },
      });
    }
    console.error('[catalog-import] job failed:', err.message);
  });

  return worker;
}
