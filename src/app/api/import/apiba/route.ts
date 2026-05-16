import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueCatalogImport } from '@/lib/queues';

export async function POST(req: NextRequest) {
  const { pageStart = 1, pageEnd = 1, pageSize = 100 } = await req.json();

  if (pageStart < 1 || pageEnd < pageStart || pageEnd > 1000 || pageSize > 100) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  const bullJobId = await enqueueCatalogImport({ source: 'apiba', pageStart, pageEnd, pageSize });

  await prisma.job.create({
    data: {
      bullJobId,
      queue:       'catalog-import',
      type:        'catalog_import',
      status:      'pending',
      payload:     { source: 'apiba', pageStart, pageEnd, pageSize } as object,
      maxAttempts: 2,
    },
  });

  return NextResponse.json({ jobId: bullJobId, companies: (pageEnd - pageStart + 1) * pageSize }, { status: 202 });
}

export async function GET() {
  const jobs = await prisma.job.findMany({
    where:   { type: 'catalog_import' },
    orderBy: { createdAt: 'desc' },
    take:    20,
    select:  { id: true, bullJobId: true, status: true, payload: true, result: true, errorMsg: true, startedAt: true, finishedAt: true, createdAt: true },
  });
  return NextResponse.json(jobs);
}
