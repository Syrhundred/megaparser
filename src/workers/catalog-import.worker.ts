import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { CatalogImportPayload } from '../lib/queues';

const APIBA_LIST_URL   = 'https://apiba.prgapp.kz/GetCompanyListAsync';
const APIBA_DETAIL_URL = 'https://apiba.prgapp.kz/CompanyFullInfo';
const DELAY_MS = 120;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── API response types ───────────────────────────────────────────────────────

interface ApibaListResult {
  bin: string;
  titleRu: string;
  addressRu?: string;
  primaryOKED?: string;
  katoTranslit?: string;
}

interface ApibaListResponse {
  pages: number;
  results: ApibaListResult[];
}

interface ContactSource {
  phone?: { value: string; href?: string }[] | null;
  website?: string | null;
  email?: string | null;
}

interface ApibaDetailResponse {
  basicInfo?: {
    bin?: string;
    titleRu?:     { value?: string };
    addressRu?:   { value?: string };
    primaryOKED?: { value?: string };
    ceo?:         { value?: { title?: string } };
    crumbsKato?:  { nameRu?: string };
    cityName?:    string;
  };
  // These can be null (not just undefined) in the API response
  gosZakupContacts?: ContactSource | null;
  userContacts?:     ContactSource | null;
  egovContacts?:     ContactSource | null;
  taxes?: {
    taxGraph?: { year: number; value: number }[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractContacts(detail: ApibaDetailResponse) {
  const phones: string[] = [];
  const addPhone = (v?: string | null) => {
    const p = v?.trim();
    if (p && !phones.includes(p)) phones.push(p);
  };

  // All three sources can carry phones — check each
  addPhone(detail.gosZakupContacts?.phone?.[0]?.value);
  addPhone(detail.userContacts?.phone?.[0]?.value);
  addPhone(detail.egovContacts?.phone?.[0]?.value);

  const email = detail.gosZakupContacts?.email?.trim()
             || detail.userContacts?.email?.trim()
             || detail.egovContacts?.email?.trim()
             || null;

  const website = detail.gosZakupContacts?.website?.trim()
               || detail.userContacts?.website?.trim()
               || null;

  return { phone: phones[0] ?? null, email, website };
}

function latestTax(detail: ApibaDetailResponse): number | null {
  const graph = detail.taxes?.taxGraph;
  if (!graph?.length) return null;
  const sorted = [...graph].sort((a, b) => b.year - a.year);
  const hit = sorted.find(t => t.value > 0);
  return hit?.value ?? null;
}

// ─── Main import logic ────────────────────────────────────────────────────────

async function processApiba(job: Job<CatalogImportPayload>) {
  const { pageStart, pageEnd, pageSize = 100, oked, kato, tax } = job.data;
  const totalPages = pageEnd - pageStart + 1;

  let imported = 0;
  let updated  = 0;
  let skipped  = 0;

  for (let page = pageStart; page <= pageEnd; page++) {
    console.log(`[catalog-import] apiba page ${page}/${pageEnd}`);

    const body: Record<string, unknown> = {
      kato:     kato ?? [],
      krp:      [],
      market:   { comparison: null },
      oked:     oked ?? [],
      page,
      pageSize,
    };
    if (tax) body.tax = tax;

    let listData: ApibaListResponse;
    try {
      const listRes = await fetch(APIBA_LIST_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!listRes.ok) { console.error(`[catalog-import] list ${listRes.status}`); continue; }
      listData = await listRes.json();
    } catch (err) {
      console.error('[catalog-import] list fetch error:', err);
      continue;
    }

    for (const company of listData.results) {
      await sleep(DELAY_MS);

      let contacts = { phone: null as string | null, email: null as string | null, website: null as string | null };
      let name      = company.titleRu;
      let address   = company.addressRu  ?? null;
      let industry  = company.primaryOKED ?? null;
      let ceo:       string | null = null;
      let city:      string | null = null;
      let taxAmount: number | null = null;

      try {
        const detailRes = await fetch(`${APIBA_DETAIL_URL}?id=${company.bin}&lang=ru`);
        if (detailRes.ok) {
          const detail: ApibaDetailResponse = await detailRes.json();
          contacts  = extractContacts(detail);
          name      = detail.basicInfo?.titleRu?.value     ?? name;
          address   = detail.basicInfo?.addressRu?.value   ?? address;
          industry  = detail.basicInfo?.primaryOKED?.value ?? industry;
          ceo       = detail.basicInfo?.ceo?.value?.title  ?? null;
          city      = detail.basicInfo?.crumbsKato?.nameRu
                   ?? detail.basicInfo?.cityName
                   ?? null;
          taxAmount = latestTax(detail);
        }
      } catch (err) {
        console.warn(`[catalog-import] detail failed bin=${company.bin}:`, err);
      }

      const websiteUrl = contacts.website ?? `internal://bin/${company.bin}`;
      const status = contacts.email  ? 'email_found'
                   : contacts.phone  ? 'contact_found'
                   : 'site_found';

      try {
        const existing = await prisma.company.findFirst({
          where: { OR: [{ bin: company.bin }, { website: websiteUrl }] },
        });

        if (existing) {
          // Always update source + metadata so company appears in registry.
          // Only overwrite contacts if we got better data.
          await prisma.company.update({
            where: { id: existing.id },
            data: {
              bin:       company.bin,
              source:    'apiba',
              industry:  industry  ?? existing.industry,
              ceo:       ceo       ?? existing.ceo,
              city:      city      ?? existing.city,
              taxAmount: taxAmount ?? existing.taxAmount,
              phone:     contacts.phone ?? existing.phone,
              email:     contacts.email ?? existing.email,
              status:    contacts.email  ? 'email_found'
                       : contacts.phone  ? 'contact_found'
                       : existing.status,
            },
          });
          updated++;
        } else {
          await prisma.company.create({
            data: {
              name,
              website:  websiteUrl,
              bin:      company.bin,
              source:   'apiba',
              phone:    contacts.phone,
              email:    contacts.email,
              address,
              industry,
              ceo,
              city,
              taxAmount,
              status,
              searchQuery: `apiba:${industry ?? ''}`,
            },
          });
          imported++;
        }
      } catch (err) {
        console.warn(`[catalog-import] db error bin=${company.bin}:`, err);
        skipped++;
      }
    }

    await job.updateProgress(Math.round(((page - pageStart + 1) / totalPages) * 100));
  }

  return { imported, updated, skipped };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createCatalogImportWorker() {
  const worker = new Worker<CatalogImportPayload>(
    'catalog-import',
    async (job) => {
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'active', startedAt: new Date(), attempt: job.attemptsMade + 1 },
      });

      const result = job.data.source === 'apiba'
        ? await processApiba(job)
        : (() => { throw new Error(`Unknown source: ${job.data.source}`); })();

      console.log(`[catalog-import] done imported=${result.imported} updated=${result.updated} skipped=${result.skipped}`);

      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'completed', finishedAt: new Date(), result: result as object },
      });

      return result;
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'failed', finishedAt: new Date(), errorMsg: err.message },
      });
    }
    console.error('[catalog-import] failed:', err.message);
  });

  return worker;
}
