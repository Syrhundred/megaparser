import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: { outreaches: { orderBy: { sentAt: 'desc' } } },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(company);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as Record<string, unknown>;
  const company = await prisma.company.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(company);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.company.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
