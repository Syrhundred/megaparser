import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint — validates an invite token and returns the associated email
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });

  if (!user || !user.inviteExpires || user.inviteExpires < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  return NextResponse.json({ email: user.email });
}
