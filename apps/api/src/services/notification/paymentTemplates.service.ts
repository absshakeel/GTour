import { NotificationType } from '@gtour/shared-types';
import { formatMinorGrouped } from '../../utils/money';
import type { NotifyPayload } from './notify.service';
import { dateWindow, type BookingNotificationContext } from './bookingContext.service';

/**
 * Payment-side in-app copy.
 *
 * Email for these events is sent by `payment/notification.service.ts`, which owns
 * the delivery record on the payment itself. These builders therefore produce the
 * bell entry only — no `email` is attached, so nothing is mailed twice — while
 * reusing the same booking facts so the two channels cannot disagree.
 */

export interface PaymentNoticeInput {
  /** Recipient: the guest for capture and refund events. */
  userId: string;
  type: NotificationType;
  context: BookingNotificationContext;
  payment: { amount_minor: number; currency: string; invoice_number?: string };
  detail?: string;
  /** Refunded amount in minor units; only meaningful for refund events. */
  refundMinor?: number;
}

/** The bell row for a payment capture, failure or refund. */
export function paymentNotice(input: PaymentNoticeInput): NotifyPayload {
  const { context, payment } = input;
  const amount = `${payment.currency} ${formatMinorGrouped(payment.amount_minor, payment.currency)}`;
  const where = context.destinationName ? ` in ${context.destinationName}` : '';

  if (input.type === NotificationType.PAYMENT_FAILED) {
    return {
      user_id: input.userId,
      type: input.type,
      title: `Payment failed — ${context.reference}`,
      body: input.detail
        ? `${amount} could not be charged for ${context.resourceName}${where}. ${input.detail}`
        : `${amount} could not be charged for ${context.resourceName}${where}. No money has been taken.`,
      link: '/dashboard/trips',
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      // The traveller has to retry, so this one is worth a sound.
      actionable: true,
    };
  }

  if (input.type === NotificationType.REFUND_UPDATE) {
    const refunded = input.refundMinor
      ? `${payment.currency} ${formatMinorGrouped(input.refundMinor, payment.currency)}`
      : 'a refund';

    return {
      user_id: input.userId,
      type: input.type,
      title: `Refund issued — ${context.reference}`,
      body:
        input.detail ??
        `${refunded} has been sent back to your original payment method for ${context.resourceName}${where}.`,
      link: '/dashboard/trips',
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      actionable: false,
    };
  }

  return {
    user_id: input.userId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: `Payment received — ${context.reference}`,
    body: `${amount} received for ${context.resourceName}${where}, ${dateWindow(
      context.startDate,
      context.endDate,
    )}.`,
    link: '/dashboard/trips',
    booking_id: context.bookingId,
    destination_id: context.destinationId,
    actionable: false,
  };
}
