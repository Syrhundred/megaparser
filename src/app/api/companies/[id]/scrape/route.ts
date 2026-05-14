import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { enqueueScrape } from '@/lib/queues';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const company = await prisma.company.findUnique({ where: { id: params.id } });
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Skip if a scrape is already queued/running for this company
    if (company.scrapeJobId) {
      return NextResponse.json(
        { queued: false, reason: 'already_running', jobId: company.scrapeJobId },
        { status: 200 },
      );
    }

    // Enqueue first to get the BullMQ job ID (fixed: scrape-{companyId})
    const bullJobId = await enqueueScrape({
      companyId: company.id,
      website:   company.website,
    });

    // Upsert Job row — handles the case where a previous Job row with the same
    // bullJobId already exists (repeated scrapes on the same company)
    await Promise.all([
      prisma.job.upsert({
        where: { bullJobId },
        update: {
          status:    'pending',
          errorMsg:  null,
          startedAt: null,
          finishedAt: null,
          result:    Prisma.JsonNull,
          payload:   { companyId: company.id, website: company.website } as object,
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
      prisma.company.update({
        where: { id: company.id },
        data:  { scrapeJobId: bullJobId },
      }),
    ]);

    return NextResponse.json({ queued: true, jobId: bullJobId }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[scrape route]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
