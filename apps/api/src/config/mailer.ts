import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email.
 *
 * Deliberately optional: when `SMTP_HOST` is blank the module reports
 * `enabled: false` and every notification is still recorded on the payment, just
 * not delivered. That keeps the gateway usable end to end on a machine with no
 * mail account, which is the normal state during development.
 */
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

let active: MailConfig | null = null;
let transporter: Transporter | null = null;

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function initMailer(): void {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || '').trim();
  const password = process.env.SMTP_PASS || '';

  active = {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    // Implicit TLS is the 465 convention; 587 upgrades with STARTTLS instead.
    secure: readBoolean(process.env.SMTP_SECURE, false),
    user,
    password,
    from: (process.env.MAIL_FROM || 'GTour <no-reply@gtour.local>').trim(),
  };

  // Rebuilt after every config change so a test harness that rewrites the
  // environment gets a transport matching the new settings.
  transporter = null;
}

export function isMailEnabled(): boolean {
  return Boolean(active?.host);
}

/**
 * Replaces the active transport outright.
 *
 * Exists so a caller can supply its own transport — a preconfigured relay, a
 * stream in a test — rather than one built from the environment. Call after
 * `initMailer()`, which resets the transport.
 */
export function setTransporter(next: Transporter | null): void {
  transporter = next;
}

export function getMailConfig(): MailConfig {
  if (!active) throw new Error('Mail config accessed before initMailer()');
  return active;
}

/**
 * The shared SMTP transport, created on first use.
 *
 * `pool: true` reuses one connection across a batch of notifications, which is
 * what a reconciliation run wants; `auth` is omitted entirely for an
 * unauthenticated relay rather than sent as empty credentials.
 */
export function getTransporter(): Transporter {
  if (transporter) return transporter;

  const config = getMailConfig();
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    pool: true,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });

  return transporter;
}
