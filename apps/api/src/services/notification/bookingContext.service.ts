import Booking, { type IBooking } from '../../models/Booking';
import Destination from '../../models/Destination';
import Hotel from '../../models/Hotel';
import PhotographyService from '../../models/PhotographyService';
import Photographer from '../../models/Photographer';
import User from '../../models/User';
import Vehicle from '../../models/Vehicle';
import VehicleProvider from '../../models/VehicleProvider';
import { BookingStatus } from '@gtour/shared-types';

/**
 * Everything a notification needs to describe a booking, resolved for all three
 * booking types.
 *
 * The payment notice originally hardcoded a hotel lookup, which silently lost the
 * resource name for photography and vehicle bookings. A booking deliberately
 * carries no destination of its own — it is derived by reading the listing it
 * points at — so this resolver is the single place that knows how to walk that
 * relationship for each type.
 */
export interface BookingNotificationContext {
  bookingId: string;
  reference: string;
  bookingType: 'hotel' | 'photography' | 'vehicle';
  /** The listing or package the guest booked, e.g. "Test Harbour Hotel". */
  resourceName: string;
  /** What kind of thing that is, for copy: "hotel", "photoshoot", "rental". */
  resourceNoun: string;
  destinationName?: string;
  destinationId?: string;
  guestId?: string;
  guestName: string;
  guestEmail?: string;
  /** Account that owns the listing, and therefore hears about new requests. */
  providerUserId?: string;
  providerName?: string;
  startDate: Date;
  endDate: Date;
  guestCount: number;
  unitCount: number;
  totalAmount: number;
  currency: string;
  status: BookingStatus;
  specialRequests?: string;
}

function destinationRefName(destination: unknown): { id?: string; name?: string } {
  if (!destination) return {};
  if (typeof destination === 'string') return { id: destination };
  const doc = destination as { _id?: unknown; name?: string };
  return { id: doc._id ? String(doc._id) : undefined, name: doc.name };
}

/** Loads a booking and every join needed to address both parties. */
export async function loadBookingContext(
  bookingOrId: IBooking | string,
): Promise<BookingNotificationContext | null> {
  const booking =
    typeof bookingOrId === 'string'
      ? await Booking.findById(bookingOrId)
      : bookingOrId;
  if (!booking) return null;

  const guest = await User.findById(booking.user_id).select('name email').lean<{
    name?: string;
    email?: string;
  } | null>();

  const context: BookingNotificationContext = {
    bookingId: String(booking._id),
    reference: booking.booking_reference,
    bookingType: booking.booking_type,
    resourceName: 'your booking',
    resourceNoun: 'booking',
    guestId: guest ? String(booking.user_id) : undefined,
    guestName: guest?.name ?? 'traveller',
    guestEmail: guest?.email,
    startDate: booking.start_date,
    endDate: booking.end_date,
    guestCount: booking.guest_count,
    unitCount: booking.room_count ?? 1,
    totalAmount: booking.total_amount,
    currency: booking.price_snapshot?.currency ?? 'BDT',
    status: booking.status,
    specialRequests: booking.special_requests,
  };

  if (booking.booking_type === 'hotel' && booking.hotel_id) {
    const hotel = await Hotel.findById(booking.hotel_id)
      .select('name owner_id destination_id')
      .populate('destination_id', 'name')
      .lean<{
        name?: string;
        owner_id?: unknown;
        destination_id?: unknown;
      } | null>();

    context.resourceName = hotel?.name ?? 'your stay';
    context.resourceNoun = 'stay';
    context.providerUserId = hotel?.owner_id ? String(hotel.owner_id) : undefined;

    const destination = destinationRefName(hotel?.destination_id);
    context.destinationId = destination.id;
    context.destinationName = destination.name;
  } else if (booking.booking_type === 'photography' && booking.photography_service_id) {
    const service = await PhotographyService.findById(booking.photography_service_id)
      .select('name photographer_id destination_id')
      .populate('destination_id', 'name')
      .lean<{ name?: string; photographer_id?: unknown; destination_id?: unknown } | null>();

    context.resourceName = service?.name ?? 'your photoshoot';
    context.resourceNoun = 'photoshoot';

    const destination = destinationRefName(service?.destination_id);
    context.destinationId = destination.id;
    context.destinationName = destination.name;

    if (service?.photographer_id) {
      const photographer = await Photographer.findById(service.photographer_id)
        .select('user_id name')
        .populate('user_id', 'name')
        .lean<{ user_id?: unknown; name?: string } | null>();

      const owner = photographer?.user_id as { _id?: unknown; name?: string } | undefined;
      context.providerUserId = owner?._id ? String(owner._id) : undefined;
      context.providerName = photographer?.name ?? owner?.name;
    }
  } else if (booking.booking_type === 'vehicle' && booking.vehicle_id) {
    const vehicle = await Vehicle.findById(booking.vehicle_id)
      .select('name provider_id destination_id')
      .populate('destination_id', 'name')
      .lean<{ name?: string; provider_id?: unknown; destination_id?: unknown } | null>();

    context.resourceName = vehicle?.name ?? 'your rental';
    context.resourceNoun = 'rental';
    context.unitCount = booking.room_count ?? 1;

    const destination = destinationRefName(vehicle?.destination_id);
    context.destinationId = destination.id;
    context.destinationName = destination.name;

    if (vehicle?.provider_id) {
      const provider = await VehicleProvider.findById(vehicle.provider_id)
        .select('user_id name')
        .populate('user_id', 'name')
        .lean<{ user_id?: unknown; name?: string } | null>();

      const owner = provider?.user_id as { _id?: unknown; name?: string } | undefined;
      context.providerUserId = owner?._id ? String(owner._id) : undefined;
      context.providerName = provider?.name ?? owner?.name;
    }
  }

  // A listing whose destination ref is missing on the row still has a name worth
  // showing, and the destination collection is the only other place to find it.
  if (!context.destinationName && context.destinationId) {
    const destination = await Destination.findById(context.destinationId)
      .select('name')
      .lean<{ name?: string } | null>();
    context.destinationName = destination?.name;
  }

  return context;
}

/** `2026-04-02 → 2026-04-05` — the format every email and notification uses. */
export function dateWindow(start: Date, end: Date): string {
  const format = (value: Date) => new Date(value).toISOString().slice(0, 10);
  return `${format(start)} → ${format(end)}`;
}
