import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DEFAULT_TEMPLATE } from '@/lib/message-builder';

export async function GET() {
  let templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } });

  // Seed default template if none exist
  if (templates.length === 0) {
    await prisma.template.create({ data: DEFAULT_TEMPLATE });
    templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
  }

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const template = await prisma.template.create({ data: body });
  return NextResponse.json(template, { status: 201 });
}
