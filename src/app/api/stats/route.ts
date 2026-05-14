import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const [total, emailFound, sent, replied, sentToday] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { email: { not: null } } }),
    prisma.company.count({ where: { status: 'sent' } }),
    prisma.company.count({ where: { status: 'replied' } }),
    prisma.outreach.count({
      where: {
        status: 'sent',
        sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  const byStatus = await prisma.company.groupBy({
    by: ['status'],
    _count: true,
  });

  return NextResponse.json({ total, emailFound, sent, replied, sentToday, byStatus });
}
