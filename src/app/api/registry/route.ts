import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// OKED section letter → numeric division prefixes stored in industry field
const OKED_DIVISIONS: Record<string, string[]> = {
  A: ['01','02','03'],
  B: ['05','06','07','08','09'],
  C: ['10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33'],
  D: ['35'],
  E: ['36','37','38','39'],
  F: ['41','42','43'],
  G: ['45','46','47'],
  H: ['49','50','51','52','53'],
  I: ['55','56'],
  J: ['58','59','60','61','62','63'],
  K: ['64','65','66'],
  L: ['68'],
  M: ['69','70','71','72','73','74','75'],
  N: ['77','78','79','80','81','82'],
};

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const page    = Math.max(1, Number(sp.get('page')  ?? 1));
  const limit   = Math.min(100, Number(sp.get('limit') ?? 50));
  const search  = sp.get('search')?.trim() ?? '';
  const oked    = sp.get('oked')?.trim() ?? '';
  const city    = sp.get('city')?.trim() ?? '';
  const hasEmail = sp.get('hasEmail');
  const hasPhone = sp.get('hasPhone');

  const okedDivisions = oked ? OKED_DIVISIONS[oked.toUpperCase()] : null;

  const AND: Prisma.CompanyWhereInput[] = [
    { source: 'apiba' },
    ...(search ? [{
      OR: [
        { name:    { contains: search, mode: 'insensitive' as const } },
        { bin:     { contains: search } },
        { address: { contains: search, mode: 'insensitive' as const } },
        { ceo:     { contains: search, mode: 'insensitive' as const } },
      ],
    }] : []),
    ...(okedDivisions ? [{
      OR: okedDivisions.map(d => ({ industry: { startsWith: d } })),
    }] : []),
    ...(city     ? [{ city:  { contains: city,  mode: 'insensitive' as const } }] : []),
    ...(hasEmail === 'true'  ? [{ email: { not: null } }] : []),
    ...(hasEmail === 'false' ? [{ email: null }] : []),
    ...(hasPhone === 'true'  ? [{ phone: { not: null } }] : []),
    ...(hasPhone === 'false' ? [{ phone: null }] : []),
  ];

  const where: Prisma.CompanyWhereInput = { AND };

  const [data, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { taxAmount: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id: true, name: true, bin: true, industry: true, city: true,
        address: true, ceo: true, phone: true, email: true, website: true,
        status: true, taxAmount: true, taxGraph: true, foundAt: true,
      },
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}
