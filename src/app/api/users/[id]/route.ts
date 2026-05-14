import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (params.id === session.user.id) {
    return NextResponse.json({ error: 'Нельзя удалить свой аккаунт' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
