import Notification from '../../models/Notification';
import User from '../../models/User';
import { getMailConfig, getTransporter, isMailEnabled } from '../../config/mailer';
import { webUrl } from '../../config/appUrls';
import { formatMajorGrouped, formatMinorGrouped } from '../../utils/money';
import { renderEmailHtml, renderEmailText, type EmailDocument } from '../../templates/emailLayout';
import { publishNotification, serialiseNotification } from './notificationHub.service';
import type { BookingNotificationContext } from './bookingContext.service';
import { dateWindow } from './bookingContext.service';
import { NotificationType, UserRole } from '@gtour/shared-types';

/**
 * The single entry point for telling a user something happened.
 *
 * Every caller gets the same three guarantees:
 *
 *  1. A row is persisted first, so the in-app bell is the source of truth and a
 *     client that was offline can still read the history.
 *  2. The live stream is fed only after the row exists, so a client that reacts
 *     to the event and re-reads the list cannot race the write.
 *  3. Email is best-effort. Nothing in here throws: a notification is a side
 *     effect of a state change that is already committed, and a mail outage must
 *     never turn a successful booking or payment into an error response.
 */

export interface NotifyPayload {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  booking_id?: string;
  payment_id?: string;
  destination_id?: string;
  /** True when the recipient has to act — drives the audible chime. */
  actionable?: boolean;
  /** Renders the branded email. Omit to keep the event in-app only. */
  email?: EmailDocument;
  /** Who to email. Falls back to the recipient account's address. */
  emailTo?: string;
}

export interface NotifyOutcome {
  id: string;
  email: { status: 'sent' | 'skipped' | 'failed'; to?: string; reason?: string };
}

/** Role-appropriate landing page, so an email link never lands a provider on a tourist page. */
export function roleLandingPath(role: string | undefined): string {
  switch (role) {
    case UserRole.HOTEL_OWNER:
      return '/dashboard/owner';
    case UserRole.PHOTOGRAPHER:
      return '/dashboard/photographer';
    case UserRole.VEHICLE_PROVIDER:
      return '/dashboard/vehicles';
    case UserRole.ADMIN:
      return '/dashboard';
    default:
      return '/dashboard';
  }
}

/**
 * Writes the notification, streams it, then attempts the email.
 *
 * Never throws. The returned id is the persisted row, so a caller that wants the
 * delivery outcome for an audit trail has it without a second read.
 */
export async function notify(payload: NotifyPayload): Promise<NotifyOutcome> {
  const notification = await Notification.create({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title.slice(0, 160),
    body: payload.body.slice(0, 1000),
    link: payload.link,
    booking_id: payload.booking_id,
    payment_id: payload.payment_id,
    destination_id: payload.destination_id,
    actionable: payload.actionable ?? false,
  });

  publishNotification(payload.user_id, serialiseNotification(notification));

  const email = await deliverEmail(notification.id, payload);
  if (email.status !== 'sent') {
    notification.email_status = email.status;
    notification.email_reason = email.reason?.slice(0, 300);
    await notification.save().catch(() => undefined);
  }

  return { id: String(notification._id), email };
}

/**
 * Sends the email half. Isolated so a transport failure can be recorded on the
 * row without unwinding the notification that was already delivered in-app.
 */
async function deliverEmail(
  notificationId: string,
  payload: NotifyPayload,
): Promise<NotifyOutcome['email']> {
  try {
    if (!payload.email) return { status: 'skipped', reason: 'no email template for this event' };
    if (!isMailEnabled()) return { status: 'skipped', reason: 'SMTP is not configured' };

    const recipient =
      payload.emailTo ??
      (
        await User.findById(payload.user_id)
          .select('email')
          .lean<{ email?: string } | null>()
      )?.email;

    if (!recipient) return { status: 'skipped', reason: 'recipient has no email address' };

    await getTransporter().sendMail({
      from: getMailConfig().from,
      to: recipient,
      subject: payload.email.heading,
      text: renderEmailText(payload.email),
      html: renderEmailHtml(payload.email),
    });

    await Notification.findByIdAndUpdate(notificationId, { email_status: 'sent' }).catch(
      () => undefined,
    );

    return { status: 'sent', to: recipient };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message.slice(0, 200) : 'send failed',
    };
  }
}

/** Money in the currency the booking was priced in. */
export function money(amountMinor: number, currency: string): string {
  return `${currency} ${formatMinorGrouped(amountMinor, currency)}`;
}

/**
 * A booking stores its amount in major units, unlike a payment which stores
 * minor units, so it is formatted with the currency's own exponent rather than
 * a fixed two places.
 */
export function bookingMoney(amount: number, currency: string): string {
  return `${currency} ${formatMajorGrouped(amount, currency)}`;
}

/**
 * Shared booking facts every booking email shows, so the copy cannot drift
 * between the guest and provider versions of the same event.
 */
export function bookingFields(
  context: BookingNotificationContext,
  options: { referenceLabel?: string; showPrice?: boolean } = {},
): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];

  if (context.destinationName) fields.push({ label: 'Destination', value: context.destinationName });
  fields.push({
    label: context.bookingType === 'hotel' ? 'Property' : 'Booked',
    value: context.resourceName,
  });
  fields.push({ label: 'Dates', value: dateWindow(context.startDate, context.endDate) });
  fields.push({
    label: context.bookingType === 'vehicle' ? 'Vehicles' : 'Guests',
    value:
      context.bookingType === 'vehicle'
        ? `${context.unitCount} vehicle${context.unitCount === 1 ? '' : 's'}`
        : `${context.guestCount} guest${context.guestCount === 1 ? '' : 's'}`,
  });
  if (options.showPrice !== false) {
    fields.push({
      label: 'Total',
      value: bookingMoney(context.totalAmount, context.currency),
    });
  }
  fields.push({
    label: options.referenceLabel ?? 'Booking reference',
    value: context.reference,
  });

  return fields;
}

/** Every email advertises the same footer, which is also the unsubscribe control. */
export const EMAIL_FOOTER =
  'You are receiving this because you have a GTour account. Booking and payment updates cannot be turned off.';

/** Turns a relative app path into the absolute URL an email link needs. */
export function absoluteLink(path: string): string {
  return webUrl(path);
}
