import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueSend } from '@/lib/queues';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { subject, message, attachmentName } = await req.json() as {
    subject: string;
    message: string;
    attachmentName?: string;
  };

  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!company.email) {
    // Record the attempt so the outreach log is complete
    await prisma.outreach.create({
      data: {
        companyId: company.id,
        channel:   'email',
        subject,
        message,
        status:    'no_email',
        errorMsg:  'Email не найден',
      },
    });
    await prisma.company.update({
      where: { id: params.id },
      data:  { status: 'no_contacts' },
    });
    return NextResponse.json({ error: 'No email found for this company' }, { status: 400 });
  }

  // Validate SMTP is configured before queuing — gives the user immediate
  // feedback rather than a silent failure 5 minutes later.
  const smtpRows = await prisma.setting.findMany({
    where: { key: { in: ['smtp_host', 'smtp_user', 'smtp_pass'] } },
  });
  const s: Record<string, string> = {};
  for (const r of smtpRows) s[r.key] = r.value;

  const host = s.smtp_host || process.env.SMTP_HOST || '';
  const user = s.smtp_user || process.env.SMTP_USER || '';
  const pass = s.smtp_pass || process.env.SMTP_PASS || '';

  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: 'SMTP not configured. Go to Settings.' },
      { status: 400 },
    );
  }

  // Create Outreach row in 'pending' state — the worker will update it to
  // 'sent' or 'send_error' after the delayed job fires.
  const outreach = await prisma.outreach.create({
    data: {
      companyId:   company.id,
      channel:     'email',
      subject,
      message,
      status:      'pending',
      scheduledAt: new Date(),
    },
  });

  // Create a Job mirror row for UI visibility
  const dbJob = await prisma.job.create({
    data: {
      queue:      'send',
      type:       'send_email',
      status:     'pending',
      payload:    { companyId: company.id, outreachId: outreach.id, attachmentName } as object,
      companyId:  company.id,
      maxAttempts: 3,
    },
  });

  // Enqueue — BullMQ will apply a random 3–8 min delay before the worker fires
  const { jobId, delayMs } = await enqueueSend({
    companyId:      company.id,
    outreachId:     outreach.id,
    attachmentName,
  });

  const scheduledAt = new Date(Date.now() + delayMs);

  // Write BullMQ job ID back to the DB row
  await Promise.all([
    prisma.job.update({
      where: { id: dbJob.id },
      data:  { bullJobId: jobId, scheduledAt },
    }),
    prisma.company.update({
      where: { id: company.id },
      data:  { sendJobId: jobId },
    }),
    prisma.outreach.update({
      where: { id: outreach.id },
      data:  { jobId, scheduledAt },
    }),
  ]);

  return NextResponse.json(
    {
      queued:      true,
      jobId,
      outreachId:  outreach.id,
      delayMs,
      scheduledAt: scheduledAt.toISOString(),
    },
    { status: 202 },
  );
}
