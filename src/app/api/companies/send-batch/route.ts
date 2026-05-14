/**
 * POST /api/companies/send-batch
 *
 * Enqueue outreach emails for multiple companies with staggered, randomised
 * delays to protect SMTP sender reputation.
 *
 * Timing model:
 *   Each company gets a random step delay in [minMs, maxMs].
 *   The actual delay for company N is the *cumulative* sum of all previous
 *   steps — so sends never cluster, even under heavy load.
 *
 *   Example (minMs=3min, maxMs=8min):
 *     company 0 → delay  5 min  (fires at T+5)
 *     company 1 → delay 11 min  (fires at T+11, step=6)
 *     company 2 → delay 14 min  (fires at T+14, step=3)
 *     ...
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueSend } from '@/lib/queues';

const MIN_STEP_MS = 3 * 60_000; // 3 minutes minimum gap between sends
const MAX_STEP_MS = 8 * 60_000; // 8 minutes maximum gap

function randomStep(): number {
  return Math.floor(Math.random() * (MAX_STEP_MS - MIN_STEP_MS + 1)) + MIN_STEP_MS;
}

export async function POST(req: NextRequest) {
  const { companyIds, subject, message, attachmentName } = await req.json() as {
    companyIds: string[];
    subject: string;
    message: string;
    attachmentName?: string;
  };

  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: 'companyIds must be a non-empty array' }, { status: 400 });
  }
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'subject and message are required' }, { status: 400 });
  }

  // Validate SMTP upfront — better to fail immediately than silently 5+ min later
  const smtpRows = await prisma.setting.findMany({
    where: { key: { in: ['smtp_host', 'smtp_user', 'smtp_pass'] } },
  });
  const s: Record<string, string> = {};
  for (const r of smtpRows) s[r.key] = r.value;

  const smtpOk =
    (s.smtp_host || process.env.SMTP_HOST) &&
    (s.smtp_user || process.env.SMTP_USER) &&
    (s.smtp_pass || process.env.SMTP_PASS);

  if (!smtpOk) {
    return NextResponse.json(
      { error: 'SMTP not configured. Go to Settings.' },
      { status: 400 },
    );
  }

  // Load all requested companies in one query
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, email: true, name: true },
  });

  const companyMap = new Map(companies.map(c => [c.id, c]));

  const queued: Array<{
    companyId: string;
    outreachId: string;
    jobId: string;
    scheduledAt: string;
  }> = [];

  const skipped: Array<{ companyId: string; reason: string }> = [];

  let cumulativeDelayMs = 0;

  for (const companyId of companyIds) {
    const company = companyMap.get(companyId);

    if (!company) {
      skipped.push({ companyId, reason: 'not found' });
      continue;
    }
    if (!company.email) {
      skipped.push({ companyId, reason: 'no email' });
      continue;
    }

    // Accumulate delay — each send is staggered beyond the previous one
    cumulativeDelayMs += randomStep();
    const scheduledAt = new Date(Date.now() + cumulativeDelayMs);

    // Substitute {{company}} and {{company_greeting}} per company
    const companyName = company.name ?? '';
    const greeting    = companyName ? `, ${companyName}` : '';
    const finalSubject = subject
      .replace(/\{\{company_greeting\}\}/g, greeting)
      .replace(/\{\{company\}\}/g, companyName);
    const finalMessage = message
      .replace(/\{\{company_greeting\}\}/g, greeting)
      .replace(/\{\{company\}\}/g, companyName);

    // Create Outreach row
    const outreach = await prisma.outreach.create({
      data: {
        companyId,
        channel:     'email',
        subject:     finalSubject,
        message:     finalMessage,
        status:      'pending',
        scheduledAt,
      },
    });

    // Create Job mirror row
    const dbJob = await prisma.job.create({
      data: {
        queue:      'send',
        type:       'send_email',
        status:     'pending',
        payload:    { companyId, outreachId: outreach.id, attachmentName } as object,
        companyId,
        maxAttempts: 3,
        scheduledAt,
      },
    });

    // Enqueue with the pre-computed cumulative delay
    const { jobId } = await enqueueSend(
      { companyId, outreachId: outreach.id, attachmentName },
      cumulativeDelayMs,
    );

    // Write BullMQ job ID back
    await Promise.all([
      prisma.job.update({
        where: { id: dbJob.id },
        data:  { bullJobId: jobId },
      }),
      prisma.company.update({
        where: { id: companyId },
        data:  { sendJobId: jobId },
      }),
      prisma.outreach.update({
        where: { id: outreach.id },
        data:  { jobId },
      }),
    ]);

    queued.push({
      companyId,
      outreachId: outreach.id,
      jobId,
      scheduledAt: scheduledAt.toISOString(),
    });
  }

  return NextResponse.json(
    {
      queued:  queued.length,
      skipped: skipped.length,
      total:   companyIds.length,
      jobs:    queued,
      ...(skipped.length > 0 ? { skippedDetails: skipped } : {}),
    },
    { status: 202 },
  );
}
