import nodemailer from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  attachmentPath?: string;
  attachmentName?: string;
}

// ─── SMTP error classification ────────────────────────────────────────────────

/**
 * Permanent SMTP errors — do not retry, they will never succeed.
 * Based on RFC 5321 reply codes and common provider error messages.
 */
const PERMANENT_CODES = new Set([
  500, 501, 502, 503, 504, // syntax / command errors
  521, 541, 550, 551, 552, 553, 554, 555, // delivery / policy failures
  535, // authentication failure
]);

const PERMANENT_PATTERNS = [
  /user (unknown|not found|does not exist)/i,
  /no such (user|mailbox|address)/i,
  /invalid (address|recipient|email)/i,
  /mailbox not found/i,
  /account (suspended|disabled|deactivated)/i,
  /authentication (failed|error|credentials)/i,
  /relay (not permitted|access denied)/i,
  /spam|policy|blocked|blacklist/i,
];

export type SmtpErrorKind = 'retryable' | 'permanent';

export function classifySmtpError(err: unknown): SmtpErrorKind {
  const msg = err instanceof Error ? err.message : String(err);

  // nodemailer attaches responseCode to SMTP errors
  const code = (err as { responseCode?: number }).responseCode;
  if (code && PERMANENT_CODES.has(code)) return 'permanent';

  // 5xx in the message text (e.g. "550 5.1.1 …")
  const codeMatch = msg.match(/\b([45]\d{2})\b/);
  if (codeMatch) {
    const n = Number(codeMatch[1]);
    if (PERMANENT_CODES.has(n)) return 'permanent';
    if (n >= 500) return 'permanent'; // unknown 5xx — treat as permanent
  }

  if (PERMANENT_PATTERNS.some(re => re.test(msg))) return 'permanent';

  return 'retryable';
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendEmail(config: EmailConfig, payload: EmailPayload) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.verify();

  const mailOptions: nodemailer.SendMailOptions = {
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  };

  if (payload.attachmentPath && payload.attachmentName) {
    mailOptions.attachments = [
      { filename: payload.attachmentName, path: payload.attachmentPath },
    ];
  }

  return transporter.sendMail(mailOptions);
}
