import type { ApiResponse } from '@gtour/shared-types';

export type { ApiResponse };

export interface PopulatedCategory {
  _id: string;
  name: string;
  icon?: string;
}

export interface PopulatedLocation {
  _id: string;
  name: string;
  country: string;
  region?: string;
}

export interface DestinationDto {
  _id: string;
  name: string;
  description: string;
  images: string[];
  estimated_budget?: number;
  best_visit_season?: string;
  average_rating?: number;
  views: number;
  category_id: PopulatedCategory | string;
  location_id: PopulatedLocation | string;
  created_at: string;
  updated_at: string;
}

export interface DestinationsResponse {
  success: boolean;
  destinations: DestinationDto[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DestinationFiltersResponse {
  success: boolean;
  categories: PopulatedCategory[];
  locations: PopulatedLocation[];
}

export interface DestinationResponse {
  success: boolean;
  destination: DestinationDto;
}

export interface HotelDto {
  _id: string;
  name: string;
  description: string;
  address: string;
  phone?: string;
  email?: string;
  images: string[];
  rating?: number;
  owner_id?: string;
  destination_id: { _id: string; name: string } | string;
  /** Cheapest nightly rate across this hotel's rooms, derived by the API. */
  price_from?: number | null;
  /** Highest nightly rate across this hotel's rooms, derived by the API. */
  price_to?: number | null;
  created_at: string;
  updated_at: string;
}

export interface HotelsResponse {
  success: boolean;
  hotels: HotelDto[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface RoomDto {
  _id: string;
  hotel_id: string;
  room_type: string;
  bed_type: string;
  capacity: number;
  price_per_night: number;
  total_rooms: number;
  amenities?: string[];
  images?: string[];
  created_at: string;
  updated_at: string;
}

export interface RoomsResponse {
  success: boolean;
  rooms: RoomDto[];
}

/** One night of a stay as priced by the server. */
export interface NightlyRateDto {
  date: string;
  available_rooms: number;
  price_per_night: number;
  status: 'available' | 'partial' | 'unavailable';
}

/** Authoritative quote returned by `GET /rooms/:id/quote`. */
export interface RoomQuoteDto {
  currency: string;
  check_in: string;
  check_out: string;
  nights: number;
  rooms: number;
  nightly: NightlyRateDto[];
  price_per_night: number;
  subtotal: number;
  total: number;
  available: boolean;
  /** Most rooms the server can still hold for every night of this stay. */
  max_rooms: number;
}

export interface RoomQuoteResponse {
  success: boolean;
  quote: RoomQuoteDto;
}

export interface RoomAvailabilityResponse {
  success: boolean;
  room_id: string;
  from: string;
  to: string;
  nights: NightlyRateDto[];
}

/** One booking row as seen by a hotel owner in the provider queue. */
export interface ProviderBookingDto {
  _id: string;
  booking_reference: string;
  booking_type: 'hotel' | 'photography' | 'vehicle';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  start_date: string;
  end_date: string;
  guest_count: number;
  room_count: number;
  total_amount: number;
  special_requests?: string;
  cancellation_reason?: string;
  user_id: { _id: string; name?: string; email?: string } | string;
  hotel_id?: { _id: string; name: string; address?: string } | string;
  hotel_room_id?: { _id: string; room_type: string; bed_type?: string; price_per_night?: number } | string;
  photography_service_id?:
    | { _id: string; name?: string; price_per_session?: number; duration_hours?: number }
    | string;
  vehicle_id?: { _id: string; name?: string; type?: string; capacity?: number; price_per_day?: number } | string;
  created_at: string;
  updated_at: string;
}

export interface ProviderBookingsResponse {
  success: boolean;
  bookings: ProviderBookingDto[];
}

export interface HotelResponse {
  success: boolean;
  hotel: HotelDto;
}

export interface RoomResponse {
  success: boolean;
  room: RoomDto;
}

export interface PhotographerDto {
  _id: string;
  name: string;
  bio?: string;
  email?: string;
  phone?: string;
  profile_image?: string;
  rating?: number;
  destination_id?: { _id: string; name: string } | string;
  created_at: string;
  updated_at: string;
}

export interface PhotographersResponse {
  success: boolean;
  photographers: PhotographerDto[];
}

export interface PhotographyServiceDto {
  _id: string;
  photographer_id: string;
  service_type: string;
  description?: string;
  price: number;
  duration_hours?: number;
  images?: string[];
}

export interface VehicleDto {
  _id: string;
  name: string;
  type: string;
  capacity: number;
  price_per_day: number;
  features?: string[];
  images?: string[];
  provider_id: { _id: string; name: string } | string;
  created_at: string;
  updated_at: string;
}

export interface VehiclesResponse {
  success: boolean;
  vehicles: VehicleDto[];
}

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  account_status: string;
}

/** Booking lifecycle values, mirrored from the server state machine. */
export type BookingStatusValue =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface LoginResponse {
  success: boolean;
  data: {
    user: AuthUserDto;
    token: string;
  };
}

/** Narrow a possibly-populated reference to its display name. */
export function refName(value: { name?: string } | string | null | undefined): string | undefined {
  if (!value || typeof value === 'string') return undefined;
  return value.name;
}

/** Region + country label for a possibly-populated location reference. */
export function locationLabel(
  value: PopulatedLocation | string | null | undefined
): string | undefined {
  if (!value || typeof value === 'string') return undefined;
  return [value.region, value.country].filter(Boolean).join(', ') || value.name;
}

/** Photography service as returned by the provider workspace endpoint. */
export interface MyPhotographyServiceDto {
  _id: string;
  photographer_id: string;
  name: string;
  description: string;
  price_per_session: number;
  duration_hours: number;
  images?: string[];
  created_at: string;
  updated_at: string;
}

/** Portfolio entry attached to the signed-in photographer. */
export interface MyPortfolioDto {
  _id: string;
  photographer_id: string;
  service_id: string;
  images: string[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface MyPhotographerResponse {
  success: boolean;
  photographer: PhotographerDto | null;
  services: MyPhotographyServiceDto[];
  portfolio: MyPortfolioDto[];
  bookings: ProviderBookingDto[];
}

export interface VehicleProviderDto {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  rating?: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleAvailabilityDto {
  _id: string;
  vehicle_id: string;
  date: string;
  available_units: number;
  status: 'available' | 'unavailable' | 'partial';
}

export interface MyVehicleProviderResponse {
  success: boolean;
  provider: VehicleProviderDto | null;
  vehicles: VehicleDto[];
  availability: VehicleAvailabilityDto[];
  bookings: ProviderBookingDto[];
}
