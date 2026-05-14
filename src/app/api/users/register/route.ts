import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const { email, name, password } = await request.json();

  if (!email || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Пароль должен быть не менее 8 символов' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 409 });
  }

  const hashed = await hash(password, 12);

  await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      password: hashed,
      role: 'admin',
    },
  });

  return NextResponse.json({ ok: true });
}
