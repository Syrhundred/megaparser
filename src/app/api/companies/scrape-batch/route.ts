import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { enqueueScrape } from '@/lib/queues';

export async function POST(req: NextRequest) {
  const { companyIds } = await req.json() as { companyIds: string[] };

  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: 'companyIds must be a non-empty array' }, { status: 400 });
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, website: true, scrapeJobId: true },
  });

  const queued: string[] = [];
  const skipped: string[] = [];

  for (const company of companies) {
    if (company.scrapeJobId) {
      skipped.push(company.id);
      continue;
    }

    const bullJobId = await enqueueScrape({ companyId: company.id, website: company.website });

    await Promise.all([
      prisma.job.upsert({
        where: { bullJobId },
        update: {
          status:     'pending',
          errorMsg:   null,
          startedAt:  null,
          finishedAt: null,
          result:     Prisma.JsonNull,
          payload:    { companyId: company.id, website: company.website } as object,
        },
        create: {
          bullJobId,
          queue:       'scrape',
          type:        'scrape_company',
          status:      'pending',
          payload:     { companyId: company.id, website: company.website } as object,
          companyId:   company.id,
          maxAttempts: 3,
        },
      }),
      prisma.company.update({ where: { id: company.id }, data: { scrapeJobId: bullJobId } }),
    ]);

    queued.push(company.id);
  }

  return NextResponse.json(
    { queued: queued.length, skipped: skipped.length, total: companyIds.length },
    { status: 202 },
  );
}
