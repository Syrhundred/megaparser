import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const page    = Math.max(1, Number(sp.get('page')  ?? 1));
  const limit   = Math.min(100, Number(sp.get('limit') ?? 50));
  const search  = sp.get('search')?.trim() ?? '';
  const oked    = sp.get('oked')?.trim() ?? '';
  const city    = sp.get('city')?.trim() ?? '';
  const hasEmail = sp.get('hasEmail');

  const where: Prisma.CompanyWhereInput = {
    source: 'apiba',
    ...(search && {
      OR: [
        { name:    { contains: search, mode: 'insensitive' } },
        { bin:     { contains: search } },
        { address: { contains: search, mode: 'insensitive' } },
        { ceo:     { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(oked && { industry: { contains: oked, mode: 'insensitive' } }),
    ...(city && { city:     { contains: city,  mode: 'insensitive' } }),
    ...(hasEmail === 'true'  && { email: { not: null } }),
    ...(hasEmail === 'false' && { email: null }),
  };

  const [data, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { taxAmount: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id: true, name: true, bin: true, industry: true, city: true,
        address: true, ceo: true, phone: true, email: true, website: true,
        status: true, taxAmount: true, foundAt: true,
      },
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}
