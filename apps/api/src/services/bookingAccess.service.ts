import Hotel from '../models/Hotel';
import Photographer from '../models/Photographer';
import PhotographyService from '../models/PhotographyService';
import Vehicle from '../models/Vehicle';
import VehicleProvider from '../models/VehicleProvider';
import { UserRole } from '@gtour/shared-types';

/**
 * Booking ownership is derived from the resource the booking points at, never
 * from a client-supplied id. Payments reuse this so a guest cannot mark their
 * own booking as paid.
 */
export interface BookingOwnershipFields {
  booking_type?: string;
  hotel_id?: unknown;
  photography_service_id?: unknown;
  vehicle_id?: unknown;
}

export interface Caller {
  userId: string;
  role: string;
}

export function isAdmin(caller: Caller | undefined): boolean {
  return caller?.role === UserRole.ADMIN;
}

/** True when the caller owns the hotel, photographer or provider behind the booking. */
export async function canManageBooking(
  caller: Caller | undefined,
  booking: BookingOwnershipFields,
): Promise<boolean> {
  if (!caller) return false;
  if (isAdmin(caller)) return true;

  if (booking.hotel_id) {
    const hotel = await Hotel.findById(booking.hotel_id).select('owner_id');
    return Boolean(hotel && String(hotel.owner_id) === caller.userId);
  }

  if (booking.photography_service_id) {
    const service = await PhotographyService.findById(booking.photography_service_id).select(
      'photographer_id',
    );
    if (!service) return false;
    const photographer = await Photographer.findById(service.photographer_id).select('user_id');
    return Boolean(photographer?.user_id && String(photographer.user_id) === caller.userId);
  }

  if (booking.vehicle_id) {
    const vehicle = await Vehicle.findById(booking.vehicle_id).select('provider_id');
    if (!vehicle) return false;
    const provider = await VehicleProvider.findById(vehicle.provider_id).select('user_id');
    return Boolean(provider?.user_id && String(provider.user_id) === caller.userId);
  }

  return false;
}

/** Resource ids the caller owns, grouped by booking type. Empty means "nothing". */
export async function ownedResources(caller: Caller) {
  const [hotelIds, photographer, provider] = await Promise.all([
    Hotel.distinct('_id', { owner_id: caller.userId }),
    Photographer.findOne({ user_id: caller.userId }).select('_id'),
    VehicleProvider.findOne({ user_id: caller.userId }).select('_id'),
  ]);

  const serviceIds = photographer
    ? await PhotographyService.distinct('_id', { photographer_id: photographer._id })
    : [];
  const vehicleIds = provider ? await Vehicle.distinct('_id', { provider_id: provider._id }) : [];

  return { hotelIds, serviceIds, vehicleIds };
}
