import { AccountStatus, NotificationType } from '@gtour/shared-types';
import AuthToken, {
  generateAuthToken,
  hashAuthToken,
  type AuthTokenType,
} from '../../models/AuthToken';
import { webUrl } from '../../config/appUrls';
import { getMailConfig, getTransporter, isMailEnabled } from '../../config/mailer';
import { renderEmailHtml, renderEmailText, type EmailDocument } from '../../templates/emailLayout';
import { EMAIL_FOOTER, notify, roleLandingPath } from './notify.service';

/**
 * Emailed account links: verifying an address, and resetting a forgotten
 * password. Both work the same way — mint a single-use token, mail a link that
 * carries the raw value, verify the hash on the way back.
 */

/** How long each link stays valid. Short enough to limit replay, long enough to use. */
const LIFETIMES: Record<AuthTokenType, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

/**
 * Mints a token for a user, invalidating any earlier unused one of the same type.
 *
 * Superseding rather than accumulating matters for password reset: an old link
 * sitting in a mailbox must stop working the moment a newer one is requested.
 */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
): Promise<{ token: string; expiresAt: Date }> {
  await AuthToken.deleteMany({ user_id: userId, type, used_at: { $exists: false } });

  const token = generateAuthToken();
  const expiresAt = new Date(Date.now() + LIFETIMES[type]);

  await AuthToken.create({
    user_id: userId,
    type,
    token_hash: hashAuthToken(token),
    expires_at: expiresAt,
  });

  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Validates and burns a token.
 *
 * Expiry is checked here as well as by the TTL index: Mongo's reaper runs about
 * once a minute, so a just-expired token can still be present and must not be
 * accepted.
 */
export async function consumeAuthToken(
  token: string,
  type: AuthTokenType,
): Promise<ConsumeResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };

  const record = await AuthToken.findOne({ token_hash: hashAuthToken(token), type });
  if (!record) return { ok: false, reason: 'invalid' };
  if (record.used_at) return { ok: false, reason: 'used' };
  if (record.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  record.used_at = new Date();
  await record.save();

  return { ok: true, userId: String(record.user_id) };
}

function verifyEmailDocument(name: string, url: string): EmailDocument {
  return {
    preheader: 'Confirm your email address to finish setting up your GTour account.',
    heading: 'Confirm your email address',
    sections: [
      {
        paragraphs: [
          `Welcome to GTour, ${name}. One click and your account is ready to book stays, photoshoots and transport across Bangladesh.`,
          'This link is valid for 24 hours and can only be used once.',
        ],
        note: 'If you did not create a GTour account you can safely ignore this email.',
      },
    ],
    action: { label: 'Verify my email', url },
    footerNote: EMAIL_FOOTER,
  };
}

function welcomeDocument(name: string, role: string): EmailDocument {
  return {
    preheader: 'Your GTour account is ready.',
    heading: `Welcome aboard, ${name}`,
    sections: [
      {
        paragraphs: [
          'Your email is confirmed and your account is active. Everything on GTour is organised by destination, so the easiest place to start is the destination you are planning to travel to.',
        ],
        fields: [{ label: 'Signed in as', value: name }],
      },
      {
        heading: 'What you can book',
        paragraphs: [
          'Stays, photographers and vehicle rentals — each one listed under the destination it serves, so nothing is scattered across separate catalogue pages.',
        ],
        action: { label: 'Browse destinations', url: webUrl('/destinations') },
      },
    ],
    action: { label: 'Open your dashboard', url: webUrl(roleLandingPath(role)) },
    footerNote: EMAIL_FOOTER,
  };
}

function passwordResetDocument(name: string, url: string): EmailDocument {
  return {
    preheader: 'Reset your GTour password.',
    heading: 'Reset your password',
    sections: [
      {
        paragraphs: [
          `Hi ${name}, we received a request to reset the password on your GTour account.`,
          'This link is valid for one hour and can only be used once. Your current password keeps working until you set a new one.',
        ],
        note: 'If you did not ask for this, no action is needed — your password has not changed.',
      },
    ],
    action: { label: 'Choose a new password', url },
    footerNote: EMAIL_FOOTER,
  };
}

/**
 * Sends the verification email alone.
 *
 * Registration calls this before the account is usable, so it deliberately does
 * not go through {@link notify}: there is no notification to record yet, and the
 * recipient cannot sign in to read one.
 */
export async function sendVerificationEmail(user: {
  _id: unknown;
  email: string;
  name: string;
}): Promise<{ sent: boolean; reason?: string; token?: string }> {
  if (!isMailEnabled()) return { sent: false, reason: 'SMTP is not configured' };

  const { token } = await issueAuthToken(String(user._id), 'email_verification');
  const document = verifyEmailDocument(user.name, webUrl(`/verify-email?token=${token}`));

  try {
    await getTransporter().sendMail({
      from: getMailConfig().from,
      to: user.email,
      subject: 'Confirm your email address · GTour',
      text: renderEmailText(document),
      html: renderEmailHtml(document),
    });
    return { sent: true, token };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
  }
}

/** Records the welcome notice and mails it. Called once an address is verified. */
export async function sendWelcomeNotice(user: {
  _id: unknown;
  email: string;
  name: string;
  role: string;
}): Promise<void> {
  await notify({
    user_id: String(user._id),
    type: NotificationType.WELCOME,
    title: 'Welcome to GTour',
    body: 'Your email is confirmed. Start by picking the destination you want to travel to.',
    link: '/destinations',
    emailTo: user.email,
    email: welcomeDocument(user.name, user.role),
  });
}

/** Mails a reset link. Answers identically whether or not the address exists. */
export async function sendPasswordResetEmail(user: {
  _id: unknown;
  email: string;
  name: string;
}): Promise<{ sent: boolean; reason?: string; token?: string }> {
  if (!isMailEnabled()) return { sent: false, reason: 'SMTP is not configured' };

  const { token } = await issueAuthToken(String(user._id), 'password_reset');
  const document = passwordResetDocument(user.name, webUrl(`/reset-password?token=${token}`));

  try {
    await getTransporter().sendMail({
      from: getMailConfig().from,
      to: user.email,
      subject: 'Reset your GTour password',
      text: renderEmailText(document),
      html: renderEmailHtml(document),
    });
    return { sent: true, token };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
  }
}

/** Accounts that a verification email is still owed to. */
export function needsVerification(status: string | undefined): boolean {
  return status === AccountStatus.PENDING_VERIFICATION;
}
