import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where = status ? { status } : {};

  const outreaches = await prisma.outreach.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    include: { company: { select: { id: true, name: true, website: true } } },
    take: 200,
  });

  return NextResponse.json(outreaches);
}
