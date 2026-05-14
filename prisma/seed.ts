import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file before seeding.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists — skipping.`);
    return;
  }

  const hashed = await hash(password, 12);
  await prisma.user.create({
    data: { email, password: hashed, name: 'Admin', role: 'admin' },
  });

  console.log(`✓ Created admin user: ${email}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
