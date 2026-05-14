import { NextRequest, NextResponse } from 'next/server';
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

    // Create a DB Job row for UI visibility
    const dbJob = await prisma.job.create({
      data: {
        queue:      'scrape',
        type:       'scrape_company',
        status:     'pending',
        payload:    { companyId: company.id, website: company.website } as object,
        companyId:  company.id,
        maxAttempts: 3,
      },
    });

    // Enqueue — the worker will run Playwright, extract contacts, write results back
    const bullJobId = await enqueueScrape({
      companyId: company.id,
      website:   company.website,
    });

    // Link BullMQ job ID to the DB row and the company
    await Promise.all([
      prisma.job.update({
        where: { id: dbJob.id },
        data:  { bullJobId },
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
