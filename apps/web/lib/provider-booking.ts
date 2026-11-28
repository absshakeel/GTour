import type { BookingStatusValue, ProviderBookingDto } from '@gtour/utils';

/**
 * Fired after a provider changes a booking status.
 *
 * The sidebar badge lives in a separate shell component from the queue that
 * performs the action, so it has no other way to learn that its count is stale.
 * Mirrors `SESSION_EVENT` in `@gtour/utils`.
 */
export const BOOKING_CHANGED_EVENT = 'gtour:booking-changed';

/** Tells any mounted provider nav badge to recount. */
export function notifyBookingChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(BOOKING_CHANGED_EVENT));
}

/**
 * Provider-side workflow vocabulary, mirroring `apps/api/src/services/bookingWorkflow.ts`.
 *
 * The API is still the authority — it rejects anything illegal with
 * `INVALID_STATUS_TRANSITION` — but offering a button the server will refuse is
 * a dead end for the user, so the UI reproduces the same table.
 */
export interface BookingAction {
  status: BookingStatusValue;
  label: string;
  /** Cancel-like actions need a reason and a confirmation step. */
  destructive?: boolean;
  /** Primary actions drive the booking forward and get the solid button. */
  advance?: boolean;
}

export const BOOKING_ACTIONS: Record<BookingStatusValue, BookingAction[]> = {
  pending: [
    { status: 'confirmed', label: 'Confirm booking', advance: true },
    { status: 'cancelled', label: 'Cancel', destructive: true },
  ],
  confirmed: [
    { status: 'completed', label: 'Mark completed', advance: true },
    { status: 'cancelled', label: 'Cancel', destructive: true },
    { status: 'no_show', label: 'No show', destructive: true },
  ],
  completed: [],
  cancelled: [],
  no_show: [],
};

/** Actions the current status allows; empty for terminal states. */
export function actionsFor(status: BookingStatusValue): BookingAction[] {
  return BOOKING_ACTIONS[status] ?? [];
}

/** True when the booking still sits with the provider for a decision. */
export function needsDecision(booking: ProviderBookingDto): boolean {
  return booking.status === 'pending';
}

/** Guest display name, falling back to email and then a neutral label. */
export function guestLabel(booking: ProviderBookingDto): string {
  const guest = booking.user_id;
  if (guest && typeof guest === 'object') return guest.name || guest.email || 'Guest';
  return 'Guest';
}

/**
 * What the provider is being asked to deliver. A hotel booking is a room, a
 * shoot is a package and a rental is a vehicle, so the same row reads correctly
 * on all three dashboards.
 */
export function providerResourceLabel(booking: ProviderBookingDto): string {
  if (booking.booking_type === 'photography') {
    const service = booking.photography_service_id;
    if (service && typeof service === 'object') return service.name || 'Photography session';
    return 'Photography session';
  }
  if (booking.booking_type === 'vehicle') {
    const vehicle = booking.vehicle_id;
    if (vehicle && typeof vehicle === 'object') return vehicle.name || 'Vehicle rental';
    return 'Vehicle rental';
  }
  const hotel = booking.hotel_id;
  const room = booking.hotel_room_id;
  const roomType = room && typeof room === 'object' ? room.room_type : undefined;
  const hotelName = hotel && typeof hotel === 'object' ? hotel.name : undefined;
  return [hotelName, roomType].filter(Boolean).join(' · ') || 'Hotel stay';
}

/** Type-aware date labels so a shoot is not described as a check-in. */
export function providerDateLabels(booking: ProviderBookingDto): { start: string; end: string } {
  if (booking.booking_type === 'photography') return { start: 'Shoot date', end: 'Finishes' };
  if (booking.booking_type === 'vehicle') return { start: 'Pick-up', end: 'Drop-off' };
  return { start: 'Check-in', end: 'Check-out' };
}

/** Unit noun for the quantity booked, pluralised by the caller. */
export function providerUnitLabel(booking: ProviderBookingDto): string {
  if (booking.booking_type === 'photography') return 'session';
  if (booking.booking_type === 'vehicle') return 'vehicle';
  return 'room';
}
/**
 * Destination the booking's listing is published under.
 *
 * Every provider booking points at exactly one listing, and each listing carries
 * its own destination, so the queue can group a photographer's shoots and a
 * fleet owner's rentals by place without a destination field on `Booking`.
 */
export function providerBookingDestination(
  booking: ProviderBookingDto,
): { _id: string; name: string } | null {
  const ref =
    booking.booking_type === 'photography'
      ? booking.photography_service_id
      : booking.booking_type === 'vehicle'
        ? booking.vehicle_id
        : booking.hotel_id;
  if (!ref || typeof ref === 'string') return null;
  const destination = ref.destination_id;
  if (!destination || typeof destination === 'string') return null;
  return destination.name ? destination : null;
}
