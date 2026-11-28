import { refName } from '@gtour/utils';
import type { TouristBookingDto } from '@/lib/tourist-api';

export type BookingType = TouristBookingDto['booking_type'];

/**
 * Traveller-facing vocabulary per booking type.
 *
 * A booking used to be rendered as a hotel stay no matter what was booked, so
 * a photo shoot showed "Hotel stay / 1 room" and a rental showed "Awaiting hotel
 * approval". Everything type-specific is funnelled through here.
 */
interface BookingCopy {
  /** Singular noun for one booking, used in headings and empty states. */
  noun: string;
  /** Plural noun for one booking, used in stat cards and counters. */
  plural: string;
  /** Workspace path used as the detail link fallback. */
  catalogue: string;
  /** Where the booked resource points on the public site. */
  detail: (booking: TouristBookingDto) => string | undefined;
  /** Shown while the request sits with the provider. */
  pendingNote: string;
  /** Shown once the provider has confirmed. */
  confirmedNote: string;
}

const COPY: Record<BookingType, BookingCopy> = {
  hotel: {
    noun: 'Stay',
    plural: 'Stays',
    catalogue: '/hotels',
    detail: (booking) => {
      const hotel = booking.hotel_id;
      if (!hotel || typeof hotel !== 'object') return undefined;
      const room = booking.hotel_room_id;
      const roomId = room && typeof room === 'object' ? room._id : typeof room === 'string' ? room : undefined;
      const params = new URLSearchParams();
      if (roomId) params.set('room', roomId);
      params.set('check_in', booking.start_date.slice(0, 10));
      params.set('check_out', booking.end_date.slice(0, 10));
      if (booking.guest_count) params.set('guests', String(booking.guest_count));
      return `/hotels/${hotel._id}?${params.toString()}`;
    },
    pendingNote: 'Awaiting hotel approval',
    confirmedNote: 'The property is expecting you',
  },
  photography: {
    noun: 'Photoshoot',
    plural: 'Photoshoots',
    catalogue: '/photographers',
    detail: (booking) => {
      const service = booking.photography_service_id;
      if (!service || typeof service !== 'object') return undefined;
      const params = new URLSearchParams();
      params.set('date', booking.start_date.slice(0, 10));
      params.set('guests', String(booking.guest_count || 1));
      return `/photographers/${service._id}?${params.toString()}`;
    },
    pendingNote: 'Awaiting photographer approval',
    confirmedNote: 'Your photographer is booked',
  },
  vehicle: {
    noun: 'Transport',
    plural: 'Transport',
    catalogue: '/vehicles',
    detail: (booking) => {
      const vehicle = booking.vehicle_id;
      if (!vehicle || typeof vehicle !== 'object') return undefined;
      const params = new URLSearchParams();
      params.set('start_date', booking.start_date.slice(0, 10));
      params.set('end_date', booking.end_date.slice(0, 10));
      params.set('guests', String(booking.guest_count || 1));
      return `/vehicles/${vehicle._id}?${params.toString()}`;
    },
    pendingNote: 'Awaiting provider approval',
    confirmedNote: 'Your driver is assigned',
  },
};

export function bookingCopy(type: BookingType): BookingCopy {
  return COPY[type] ?? COPY.hotel;
}

export function bookingTypeLabel(type: BookingType): string {
  if (type === 'photography') return 'Photography';
  if (type === 'vehicle') return 'Transport';
  return 'Stay';
}

/** The booked resource: hotel, photography package or vehicle. */
export function bookingResourceName(booking: TouristBookingDto): string {
  if (booking.booking_type === 'photography') {
    const service = booking.photography_service_id;
    if (service && typeof service === 'object') return service.name || 'Photoshoot';
    return 'Photoshoot';
  }
  if (booking.booking_type === 'vehicle') {
    const vehicle = booking.vehicle_id;
    if (vehicle && typeof vehicle === 'object') return vehicle.name || 'Vehicle rental';
    return 'Vehicle rental';
  }
  const hotel = booking.hotel_id;
  if (hotel && typeof hotel === 'object' && hotel.name) return hotel.name;
  return 'Hotel stay';
}

/**
 * The line under the resource name. Hotels are secondary to their destination,
 * so the place name comes back here; the other types describe what was hired.
 */
export function bookingSubtitle(booking: TouristBookingDto): string | undefined {
  if (booking.booking_type === 'photography') {
    const service = booking.photography_service_id;
    if (service && typeof service === 'object') {
      const hours = service.duration_hours;
      return hours ? `${hours} hour session` : 'Photo session';
    }
    return 'Photo session';
  }
  if (booking.booking_type === 'vehicle') {
    const vehicle = booking.vehicle_id;
    if (vehicle && typeof vehicle === 'object') {
      return [vehicle.type, vehicle.capacity ? `${vehicle.capacity} seats` : null]
        .filter(Boolean)
        .join(' · ') || 'Vehicle with driver';
    }
    return 'Vehicle with driver';
  }
  const hotel = booking.hotel_id;
  if (!hotel || typeof hotel !== 'object') return undefined;
  const room = booking.hotel_room_id;
  const roomType = room && typeof room === 'object' ? room.room_type : undefined;
  return [refName(hotel.destination_id), roomType].filter(Boolean).join(' · ') || hotel.address;
}

export function bookingCover(booking: TouristBookingDto): string | undefined {
  if (booking.booking_type === 'hotel') {
    const hotel = booking.hotel_id;
    if (hotel && typeof hotel === 'object') return hotel.images?.[0];
    return undefined;
  }

  const resource =
    booking.booking_type === 'photography' ? booking.photography_service_id : booking.vehicle_id;
  if (resource && typeof resource === 'object') return resource.images?.[0];
  return undefined;
}

/** Display name of the destination a booking belongs to, for any booking type. */
export function bookingDestination(booking: TouristBookingDto): string | undefined {
  return refName(bookingDestinationRef(booking));
}

/**
 * The raw destination reference behind a booking. Hotels link their own
 * destination; photography packages and vehicles link theirs directly, which is
 * what makes the traveller dashboard destination-first across all three types.
 */
function bookingDestinationRef(
  booking: TouristBookingDto,
): { _id: string; name: string } | string | undefined {
  if (booking.booking_type === 'hotel') {
    const hotel = booking.hotel_id;
    if (!hotel || typeof hotel !== 'object') return undefined;
    return hotel.destination_id;
  }

  if (booking.booking_type === 'photography') {
    const service = booking.photography_service_id;
    if (!service || typeof service !== 'object') return undefined;
    return service.destination_id;
  }

  const vehicle = booking.vehicle_id;
  if (!vehicle || typeof vehicle !== 'object') return undefined;
  return vehicle.destination_id;
}

export function bookingDestinationId(booking: TouristBookingDto): string | undefined {
  const destination = bookingDestinationRef(booking);
  if (destination && typeof destination === 'object') return destination._id;
  return typeof destination === 'string' ? destination : undefined;
}

/** Unit noun for the quantity the traveller booked. */
export function bookingUnitLabel(booking: TouristBookingDto): string {
  if (booking.booking_type === 'photography') return 'Session';
  if (booking.booking_type === 'vehicle') return 'Vehicle';
  return 'Room';
}
