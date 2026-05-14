import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      inviteToken: true,
      inviteExpires: true,
      createdAt: true,
      // password intentionally excluded
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  if (existing) {
    // Refresh the invite token for an already-invited but unregistered user
    if (existing.password) {
      return NextResponse.json({ error: 'Пользователь уже зарегистрирован' }, { status: 409 });
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { inviteToken: token, inviteExpires: expires },
    });
  } else {
    await prisma.user.create({
      data: { email: normalized, inviteToken: token, inviteExpires: expires },
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/register?token=${token}`;

  return NextResponse.json({ inviteUrl, email: normalized, expiresAt: expires });
}
