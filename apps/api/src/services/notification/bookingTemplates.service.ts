import { NotificationType } from '@gtour/shared-types';
import type { EmailDocument } from '../../templates/emailLayout';
import {
  EMAIL_FOOTER,
  absoluteLink,
  bookingFields,
  type NotifyPayload,
} from './notify.service';
import { dateWindow, type BookingNotificationContext } from './bookingContext.service';

/**
 * Booking lifecycle copy, in one place.
 *
 * Each status change produces up to two notifications — the guest hears the
 * outcome, the provider hears the request — and both are built here so the
 * wording of "what happened" can never diverge between the two audiences.
 *
 * `actionable` is set on exactly the events where somebody has to do something.
 * That flag is what the browser uses to decide whether to chime: a confirmation
 * that merely informs should not make a sound.
 */

const NOUNS = {
  hotel: { noun: 'stay', verb: 'Stay' },
  photography: { noun: 'photoshoot', verb: 'Session' },
  vehicle: { noun: 'rental', verb: 'Rental' },
} as const;

function nouns(type: BookingNotificationContext['bookingType']) {
  return NOUNS[type] ?? NOUNS.hotel;
}

function where(context: BookingNotificationContext): string {
  return context.destinationName ? ` in ${context.destinationName}` : '';
}

const GUEST_BOOKING_PATH = '/dashboard/trips';

/** Exported so tests can assert that a guest CTA and the web route agree. */
export { GUEST_BOOKING_PATH };

/**
 * Where a provider reads their bookings, per booking type.
 *
 * Provider notifications used to all point at `/dashboard/bookings`, a route that
 * does not exist for any role, so every "accept or decline" email led to a 404.
 * The provider's workspace differs by what they sell, so the path does too.
 */
const PROVIDER_BOOKING_PATHS: Record<BookingNotificationContext['bookingType'], string> = {
  hotel: '/dashboard/owner/bookings',
  photography: '/dashboard/photographer#shoots',
  vehicle: '/dashboard/vehicles#rentals',
};

function providerBookingsPath(context: BookingNotificationContext): string {
  return PROVIDER_BOOKING_PATHS[context.bookingType] ?? '/dashboard';
}

/** Notification + email for the guest's own new request. */
export function bookingCreatedGuest(context: BookingNotificationContext): NotifyPayload {
  const { noun } = nouns(context.bookingType);

  return {
    user_id: context.guestId ?? '',
    type: NotificationType.BOOKING_CREATED,
    title: `Request sent — ${context.reference}`,
    body: `Your ${noun} ${context.resourceName}${where(context)} is awaiting confirmation.`,
    link: GUEST_BOOKING_PATH,
    booking_id: context.bookingId,
    destination_id: context.destinationId,
    actionable: false,
    email: {
      preheader: `We have your request for ${context.resourceName}.`,
      heading: `We have your ${noun} request`,
      subheading: context.reference,
      sections: [
        {
          paragraphs: [
            `Thanks, ${context.guestName}. We passed your request for ${context.resourceName}${where(
              context,
            )} to the provider. You will get another email the moment they accept it.`,
          ],
          fields: bookingFields(context),
        },
        {
          heading: 'What happens next',
          paragraphs: [
            'The provider reviews availability and confirms or declines. You can cancel free of charge while the request is pending.',
            context.specialRequests ? `Your note to the provider: “${context.specialRequests}”` : '',
          ].filter(Boolean),
          note: 'You are not charged until the provider accepts your request.',
        },
      ],
      action: { label: 'Track this request', url: absoluteLink(GUEST_BOOKING_PATH) },
      footerNote: EMAIL_FOOTER,
    },
  };
}

/** Notification + email telling the provider a new request is waiting. */
export function bookingCreatedProvider(context: BookingNotificationContext): NotifyPayload | null {
  if (!context.providerUserId) return null;
  const { noun } = nouns(context.bookingType);

  return {
    user_id: context.providerUserId,
    type: NotificationType.BOOKING_CREATED,
    title: `New ${noun} request — ${context.reference}`,
    body: `${context.guestName} requested ${context.resourceName}, ${dateWindow(
      context.startDate,
      context.endDate,
    )}. Accept or decline to keep your response time up.`,
    link: providerBookingsPath(context),
    booking_id: context.bookingId,
    destination_id: context.destinationId,
    // The provider is the one who has to respond, so this is the event the
    // dashboard chimes for.
    actionable: true,
    email: {
      preheader: `${context.guestName} is waiting for your decision.`,
      heading: `New ${noun} request`,
      subheading: context.reference,
      sections: [
        {
          paragraphs: [
            `${context.guestName} has requested ${context.resourceName}${where(
              context,
            )}. Accepting holds the dates for the guest and moves the request into their payment step.`,
          ],
          fields: bookingFields(context),
        },
        {
          heading: 'Guest',
          fields: [{ label: 'Name', value: context.guestName }],
          note: context.specialRequests
            ? `Special request: “${context.specialRequests}”`
            : undefined,
        },
      ],
      action: { label: 'Accept or decline', url: absoluteLink(providerBookingsPath(context)) },
      footerNote: EMAIL_FOOTER,
    },
  };
}

/** Notification + email for a guest whose booking moved to a terminal/final state. */
export function bookingStatusGuest(
  context: BookingNotificationContext,
  to: string,
  reason?: string,
): NotifyPayload {
  const { noun } = nouns(context.bookingType);
  const base = {
    user_id: context.guestId ?? '',
    booking_id: context.bookingId,
    destination_id: context.destinationId,
    link: GUEST_BOOKING_PATH,
  };

  if (to === 'confirmed') {
    return {
      ...base,
      type: NotificationType.BOOKING_CONFIRMED,
      title: `Booking confirmed — ${context.reference}`,
      body: `${context.resourceName}${where(context)} confirmed your ${noun} for ${dateWindow(
        context.startDate,
        context.endDate,
      )}.`,
      actionable: false,
      email: {
        preheader: `${context.resourceName} accepted your ${noun}.`,
        heading: `Your ${noun} is confirmed`,
        subheading: context.reference,
        sections: [
          {
            paragraphs: [
              `Good news — ${context.resourceName}${where(context)} accepted your ${noun}.`,
              'Keep this reference handy; it is what the provider will ask for.',
            ],
            fields: bookingFields(context),
          },
          {
            heading: 'Before you travel',
            paragraphs: [
              'Your provider will contact you with arrival or meeting details. Any balance owed is settled on the payment step of this booking.',
            ],
          },
        ],
        action: { label: 'Open your trip', url: absoluteLink(GUEST_BOOKING_PATH) },
        footerNote: EMAIL_FOOTER,
      },
    };
  }

  if (to === 'completed') {
    return {
      ...base,
      type: NotificationType.BOOKING_COMPLETED,
      title: `Trip completed — ${context.reference}`,
      body: `We hope ${context.resourceName}${where(context)} looked after you well. You can now download your invoice.`,
      actionable: false,
      email: {
        preheader: 'Your invoice is ready to download.',
        heading: 'Thanks for travelling with GTour',
        subheading: context.reference,
        sections: [
          {
            paragraphs: [
              `${context.resourceName}${where(context)} marked your ${noun} as completed. Your invoice is attached to the booking and can be downloaded at any time.`,
            ],
            fields: bookingFields(context),
          },
        ],
        action: { label: 'View your trips', url: absoluteLink(GUEST_BOOKING_PATH) },
        footerNote: EMAIL_FOOTER,
      },
    };
  }

  if (to === 'cancelled') {
    return {
      ...base,
      type: NotificationType.BOOKING_CANCELLED,
      title: `Booking cancelled — ${context.reference}`,
      body: `${context.resourceName}${where(context)} cancelled your ${noun}. Any amount already charged is refunded to the original payment method.`,
      actionable: false,
      email: {
        preheader: `${context.reference} was cancelled.`,
        heading: 'Your booking was cancelled',
        subheading: context.reference,
        sections: [
          {
            paragraphs: [
              `${context.resourceName}${where(context)} cancelled your ${noun}.`,
              reason ? `Reason given: ${reason}` : 'No reason was given.',
            ],
            fields: bookingFields(context),
          },
          {
            heading: 'Refund',
            paragraphs: [
              'If a payment was captured for this booking, the refund is issued to the original payment method and you will get a separate email when it settles.',
            ],
          },
        ],
        action: { label: 'Find another option', url: absoluteLink('/destinations') },
        footerNote: EMAIL_FOOTER,
      },
    };
  }

  // no_show
  return {
    ...base,
    type: NotificationType.BOOKING_NO_SHOW,
    title: `Marked as no-show — ${context.reference}`,
    body: `${context.resourceName} recorded that the ${noun} was not taken up. Contact support if this is wrong.`,
    actionable: true,
    email: {
      preheader: `A no-show was recorded on ${context.reference}.`,
      heading: 'A no-show was recorded',
      subheading: context.reference,
      sections: [
        {
          paragraphs: [
            `${context.resourceName}${where(context)} recorded that you did not arrive for this ${noun}.`,
            'If the dates or the provider are wrong, reply to this email and our team will review the booking.',
          ],
          fields: bookingFields(context),
        },
      ],
      action: { label: 'Review the booking', url: absoluteLink(GUEST_BOOKING_PATH) },
      footerNote: EMAIL_FOOTER,
    },
  };
}

/** Notification only (no email) for a provider whose booking changed under them. */
export function bookingStatusProvider(
  context: BookingNotificationContext,
  to: string,
  reason?: string,
): NotifyPayload | null {
  if (!context.providerUserId) return null;
  const { noun } = nouns(context.bookingType);

  if (to === 'cancelled') {
    return {
      user_id: context.providerUserId,
      type: NotificationType.BOOKING_CANCELLED,
      title: `Booking cancelled — ${context.reference}`,
      body: `${context.guestName} cancelled the ${noun} ${context.resourceName} for ${dateWindow(
        context.startDate,
        context.endDate,
      )}. The dates are available again.`,
      link: providerBookingsPath(context),
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      actionable: true,
      email: {
        preheader: `${context.reference} was cancelled; the dates are free again.`,
        heading: `Booking cancelled — ${context.resourceName}`,
        subheading: context.reference,
        sections: [
          {
            paragraphs: [
              `The ${noun} for ${context.guestName}${where(context)} was cancelled. Held inventory has been released, so the dates are bookable again.`,
              reason ? `Reason: ${reason}` : '',
            ].filter(Boolean),
            fields: bookingFields(context, { showPrice: false }),
          },
        ],
        action: { label: 'Open your bookings', url: absoluteLink(providerBookingsPath(context)) },
        footerNote: EMAIL_FOOTER,
      },
    };
  }

  if (to === 'completed') {
    return {
      user_id: context.providerUserId,
      type: NotificationType.BOOKING_COMPLETED,
      title: `Marked complete — ${context.reference}`,
      body: `${context.guestName}'s ${noun} has been closed out. Nothing further is needed.`,
      link: providerBookingsPath(context),
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      actionable: false,
    };
  }

  if (to === 'no_show') {
    return {
      user_id: context.providerUserId,
      type: NotificationType.BOOKING_NO_SHOW,
      title: `Recorded as no-show — ${context.reference}`,
      body: `${context.guestName} was marked as a no-show. This record is visible to our support team.`,
      link: providerBookingsPath(context),
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      actionable: false,
    };
  }

  // confirmed — the provider did it themselves, so this is a receipt only.
  if (to === 'confirmed') {
    return {
      user_id: context.providerUserId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: `You confirmed — ${context.reference}`,
      body: `${context.guestName} has been told that ${context.resourceName} is confirmed.`,
      link: providerBookingsPath(context),
      booking_id: context.bookingId,
      destination_id: context.destinationId,
      actionable: false,
    };
  }

  return null;
}

/** Subject used by the account-setup emails, kept with the rest of the copy. */
export function accountEmail(section: {
  heading: string;
  preheader: string;
  paragraphs: string[];
  action: { label: string; url: string };
  note?: string;
}): EmailDocument {
  return {
    preheader: section.preheader,
    heading: section.heading,
    sections: [{ paragraphs: section.paragraphs, note: section.note }],
    action: section.action,
    footerNote: EMAIL_FOOTER,
  };
}
