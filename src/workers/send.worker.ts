import path from 'path';
import fs from 'fs';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { sendEmail, classifySmtpError } from '../lib/email';
import { SendJobPayload } from '../lib/queues';

// ─── SMTP config loader ───────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

async function loadSmtpConfig(): Promise<SmtpConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] } },
  });
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  return {
    host: s.smtp_host || process.env.SMTP_HOST || '',
    port: Number(s.smtp_port || process.env.SMTP_PORT || 587),
    user: s.smtp_user || process.env.SMTP_USER || '',
    pass: s.smtp_pass || process.env.SMTP_PASS || '',
    from: s.smtp_from || process.env.SMTP_FROM || s.smtp_user || process.env.SMTP_USER || '',
  };
}

// ─── Job processor ────────────────────────────────────────────────────────────

async function processJob(job: Job<SendJobPayload>): Promise<void> {
  const { companyId, outreachId, attachmentName } = job.data;

  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data: { status: 'active', startedAt: new Date(), attempt: job.attemptsMade + 1 },
  });

  // Load company + outreach in parallel
  const [outreach, company] = await Promise.all([
    prisma.outreach.findUnique({ where: { id: outreachId } }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);

  if (!outreach || !company) {
    // Record was deleted — no point retrying
    throw new UnrecoverableError(`Outreach ${outreachId} or company ${companyId} not found`);
  }

  if (!company.email) {
    throw new UnrecoverableError(`Company ${companyId} has no email address`);
  }

  const smtp = await loadSmtpConfig();
  if (!smtp.host || !smtp.user || !smtp.pass) {
    // SMTP not configured — unrecoverable, retrying won't help
    throw new UnrecoverableError('SMTP is not configured. Set it in Settings.');
  }

  await job.updateProgress(20);
  console.log(
    `[send] job=${job.id} attempt=${job.attemptsMade + 1} ` +
    `company=${companyId} to=${company.email}`,
  );

  // Resolve attachment path if provided
  let attachmentPath: string | undefined;
  if (attachmentName) {
    const candidate = path.join(process.cwd(), 'public', 'uploads', attachmentName);
    if (fs.existsSync(candidate)) {
      attachmentPath = candidate;
    } else {
      console.warn(`[send] attachment not found: ${candidate}`);
    }
  }

  try {
    await sendEmail(
      { host: smtp.host, port: smtp.port, user: smtp.user, pass: smtp.pass, from: smtp.from },
      {
        to:             company.email,
        subject:        outreach.subject ?? '',
        text:           outreach.message,
        attachmentPath,
        attachmentName,
      },
    );
  } catch (err) {
    const kind = classifySmtpError(err);
    const msg  = err instanceof Error ? err.message : String(err);

    console.error(`[send] SMTP error (${kind}) job=${job.id}: ${msg}`);

    // For permanent failures (bad address, auth error, etc.) do not burn retries —
    // throw UnrecoverableError so BullMQ moves straight to failed state.
    if (kind === 'permanent') {
      await prisma.outreach.update({
        where: { id: outreachId },
        data:  { status: 'send_error', errorMsg: `[permanent] ${msg}` },
      });
      await prisma.company.update({
        where: { id: companyId },
        data:  { status: 'send_error', sendJobId: null },
      });
      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  { status: 'failed', errorMsg: `[permanent] ${msg}`, finishedAt: new Date() },
      });
      throw new UnrecoverableError(`[permanent SMTP] ${msg}`);
    }

    // Retryable — re-throw so BullMQ applies the backoff and tries again
    throw err;
  }

  await job.updateProgress(90);

  // ── Success ──
  await prisma.outreach.update({
    where: { id: outreachId },
    data:  { status: 'sent', jobId: job.id ?? null },
  });
  await prisma.company.update({
    where: { id: companyId },
    data:  { status: 'sent', sentMessage: outreach.message, sentAt: new Date(), sendJobId: null },
  });
  await prisma.job.updateMany({
    where: { bullJobId: job.id },
    data:  { status: 'completed', finishedAt: new Date() },
  });

  await job.updateProgress(100);
  console.log(`[send] done job=${job.id} to=${company.email}`);
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createSendWorker() {
  const worker = new Worker<SendJobPayload>('send', processJob, {
    connection: redis,
    concurrency: 1, // never send two emails at the same instant

    // Belt-and-suspenders rate limit: even if multiple delayed jobs become
    // active at the same time, process at most 1 every 2 minutes.
    // The 3–8 min per-job delay in enqueueSend already staggers sends;
    // this is the safety net.
    limiter: {
      max:      1,
      duration: 2 * 60_000, // 2 minutes
    },
  });

  worker.on('failed', async (job, err) => {
    // UnrecoverableError is already handled inside processJob — skip double-write
    if (err instanceof UnrecoverableError) return;

    console.error(`[send] failed job=${job?.id} attempt=${job?.attemptsMade}`, err.message);

    if (job) {
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 3);

      await prisma.outreach.update({
        where: { id: job.data.outreachId },
        data:  {
          status:     isFinal ? 'send_error' : 'pending',
          errorMsg:   err.message,
          retryCount: { increment: 1 },
        },
      }).catch(() => null);

      if (isFinal) {
        await prisma.company.update({
          where: { id: job.data.companyId },
          data:  { status: 'send_error', sendJobId: null },
        }).catch(() => null);
      }

      await prisma.job.updateMany({
        where: { bullJobId: job.id },
        data:  {
          status:     isFinal ? 'failed' : 'pending',
          errorMsg:   err.message,
          finishedAt: isFinal ? new Date() : undefined,
        },
      });
    }
  });

  worker.on('error', (err) => {
    console.error('[send] worker error', err);
  });

  return worker;
}
