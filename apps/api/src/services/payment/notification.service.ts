import Booking from '../../models/Booking';
import User from '../../models/User';
import type { IPayment } from '../../models/Payment';
import { getMailConfig, getTransporter, isMailEnabled } from '../../config/mailer';
import { webUrl } from '../../config/appUrls';
import { formatMinorGrouped } from '../../utils/money';
import { isCapturedPayment } from '@gtour/shared-types';
import { renderEmailHtml, renderEmailText, type EmailDocument } from '../../templates/emailLayout';
import {
  dateWindow,
  loadBookingContext,
  type BookingNotificationContext,
} from '../notification/bookingContext.service';
import { bookingFields } from '../notification/notify.service';

/** What happened, which decides the wording and the link in the email. */
export type PaymentNoticeKind =
  | 'payment_received'
  | 'payment_failed'
  | 'refund_update';

export interface DeliveryOutcome {
  /** `recorded` means the notice is on the payment but no mail went out. */
  status: 'sent' | 'recorded' | 'failed';
  to?: string;
  reason?: string;
}

/**
 * The email for each notice kind.
 *
 * Copy is kept as data so it can be reviewed, and rendered through the shared
 * branded shell so a payment mail looks like the booking mails rather than a
 * bare paragraph. The field panel is the same one booking emails use, so a
 * traveller sees identical facts in the same order everywhere.
 */
function compose(
  kind: PaymentNoticeKind,
  context: BookingNotificationContext,
  payment: IPayment,
  detail?: string,
): EmailDocument {
  const amount = `${payment.currency} ${formatMinorGrouped(payment.amount_minor ?? 0, payment.currency)}`;
  const property = context.resourceName;
  const reference = context.reference;

  const heading =
    kind === 'payment_received'
      ? 'Payment received'
      : kind === 'payment_failed'
        ? 'Payment could not be completed'
        : 'Refund update';

  const paragraphs =
    kind === 'payment_received'
      ? [
          `We have received ${amount} for your ${property} booking ${reference}.`,
          `Stay: ${dateWindow(context.startDate, context.endDate)}`,
          payment.invoice_number
            ? `Invoice ${payment.invoice_number} is ready to download.`
            : 'Your invoice is ready to download from your booking.',
        ]
      : kind === 'payment_failed'
        ? [
            `We could not complete the payment of ${amount} for your ${property} booking ${reference}.`,
            detail ? `Reason reported by the gateway: ${detail}` : 'No money has been taken.',
            'You can try again from your booking page.',
          ]
        : [
            detail ??
              `There is an update on a refund for your ${property} booking ${reference}.`,
            `Stay: ${dateWindow(context.startDate, context.endDate)}`,
          ];

  return {
    preheader:
      kind === 'payment_received'
        ? `${amount} received for ${property} · ${reference}`
        : `${heading} · ${reference}`,
    heading,
    subheading: reference,
    sections: [
      {
        paragraphs,
        fields: [
          ...bookingFields(context, { showPrice: false }),
          { label: 'Amount', value: amount },
          ...(payment.invoice_number
            ? [{ label: 'Invoice', value: payment.invoice_number }]
            : []),
        ],
        note:
          kind === 'payment_failed'
            ? 'No money has been taken. This booking stays reserved while payment is outstanding.'
            : undefined,
      },
    ],
    action: { label: 'View your booking', url: webUrl('/dashboard/trips') },
    footerNote: 'GTour — Global Tourism Platform',
  };
}

/**
 * Emails the guest about a payment event.
 *
 * Never throws: a notification is a side effect of a state change that has
 * already been persisted, so a mail outage must not turn a successful payment
 * into an error response to the gateway. The outcome is returned instead and the
 * caller records it on the payment.
 */
export async function sendPaymentNotice(
  payment: IPayment,
  kind: PaymentNoticeKind,
  detail?: string,
): Promise<DeliveryOutcome> {
  try {
    const booking = await Booking.findById(payment.booking_id).lean();
    if (!booking) return { status: 'recorded', reason: 'booking not found' };

    const context = await loadBookingContext(String(booking._id));
    if (!context) return { status: 'recorded', reason: 'booking not found' };

    // `loadBookingContext` only knows the guest id when their account still
    // resolves, so the address is read here where the test harness injects it.
    const guest = await User.findById(booking.user_id).select('name email').lean<{
      name?: string;
      email?: string;
    } | null>();
    const guestEmail = guest?.email;

    if (!isMailEnabled()) {
      return { status: 'recorded', to: guestEmail, reason: 'SMTP is not configured' };
    }

    if (!guestEmail) return { status: 'recorded', reason: 'guest has no email address' };

    const document = compose(kind, context, payment, detail);
    // The subject leads with the event, then the property, then the reference, so
    // it is legible in a notification list and unambiguous across bookings.
    const subject =
      kind === 'payment_received'
        ? `GTour — Payment received: ${context.resourceName} ${context.reference}`
        : kind === 'payment_failed'
          ? `GTour — Payment could not be completed: ${context.reference}`
          : `GTour — Refund update: ${context.reference}`;

    await getTransporter().sendMail({
      from: getMailConfig().from,
      to: guestEmail,
      subject,
      text: renderEmailText(document),
      html: renderEmailHtml(document),
    });

    return { status: 'sent', to: guestEmail };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message.slice(0, 200) : 'send failed',
    };
  }
}

/** Whether a payment in this state is worth telling the guest about. */
export function shouldNotifyOnCapture(status: string | undefined): boolean {
  return isCapturedPayment(status);
}
