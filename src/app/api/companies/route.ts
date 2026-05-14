import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',   10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name:    { contains: search } },
      { website: { contains: search } },
      { email:   { contains: search } },
    ];
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { outreaches: { orderBy: { sentAt: 'desc' }, take: 1 } },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({ data: companies, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string;
    website?: string;
    description?: string;
    address?: string;
    phone?: string;
    email?: string;
    searchQuery?: string;
    source?: string;
    twoGisId?: string;
  };

  // Prefer the real website; fall back to the 2GIS firm page (opens in browser);
  // last resort: an internal placeholder so the @unique constraint is satisfied.
  const website = body.website?.trim()
    || (body.twoGisId ? `https://2gis.ru/firm/${body.twoGisId}` : null)
    || `internal://${body.source ?? 'unknown'}/${encodeURIComponent(body.name)}`;

  try {
    // Determine initial status based on what data we already have
    let status = 'site_found';
    if (body.email)       status = 'email_found';
    else if (body.phone)  status = 'contact_found';

    const company = await prisma.company.upsert({
      where: { website },
      update: {},
      create: {
        name: body.name || (() => { try { return new URL(website).hostname; } catch { return website; } })(),
        website,
        description: body.description ?? null,
        address: body.address ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        searchQuery: body.searchQuery ?? null,
        status,
      },
    });
    return NextResponse.json(company, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
