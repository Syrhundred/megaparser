import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  return NextResponse.json({ ok: true });
}
