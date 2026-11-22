import { apiClient } from '@gtour/utils';
import type {
  BookingStatusValue,
  DestinationsResponse,
  HotelDto,
  HotelResponse,
  HotelsResponse,
  ProviderBookingDto,
  ProviderBookingsResponse,
  RoomAvailabilityResponse,
  RoomDto,
  RoomResponse,
  RoomsResponse,
} from '@gtour/utils';

/**
 * Owner-facing API calls for the provider dashboard.
 *
 * Every request is authenticated by the shared axios interceptor, which attaches
 * the bearer token. The API independently re-checks ownership on each route, so
 * these helpers are convenience only — they never decide authorization.
 */

export interface HotelInput {
  name: string;
  description: string;
  address: string;
  phone?: string;
  email?: string;
  images: string[];
  destination_id: string;
}

export interface RoomInput {
  hotel_id: string;
  room_type: string;
  bed_type: string;
  capacity: number;
  price_per_night: number;
  total_rooms: number;
  amenities: string[];
  images: string[];
}

export interface AvailabilityInput {
  start_date: string;
  end_date: string;
  available_rooms: number;
  price_override?: number | null;
  status?: 'available' | 'unavailable' | 'partial';
}

export async function fetchMyHotels(): Promise<HotelsResponse> {
  const { data } = await apiClient.get<HotelsResponse>('/hotels/mine');
  return data;
}

export interface DestinationOption {
  _id: string;
  name: string;
  country?: string;
}

/** Destination choices for the property form; the collection is small enough to load whole. */
export async function fetchDestinationOptions(): Promise<DestinationOption[]> {
  const { data } = await apiClient.get<DestinationsResponse>('/destinations', {
    params: { limit: 100 },
  });

  return (data.destinations ?? []).map((destination) => ({
    _id: destination._id,
    name: destination.name,
    country:
      typeof destination.location_id === 'string' ? undefined : destination.location_id.country,
  }));
}

export async function createHotel(input: HotelInput): Promise<HotelDto> {
  const { data } = await apiClient.post<HotelResponse>('/hotels', input);
  return data.hotel;
}

export async function updateHotel(id: string, input: Partial<HotelInput>): Promise<HotelDto> {
  const { data } = await apiClient.put<HotelResponse>(`/hotels/${encodeURIComponent(id)}`, input);
  return data.hotel;
}

export async function deleteHotel(id: string): Promise<void> {
  await apiClient.delete(`/hotels/${encodeURIComponent(id)}`);
}

export async function fetchRooms(hotelId: string): Promise<RoomDto[]> {
  const { data } = await apiClient.get<RoomsResponse>(
    `/rooms/hotel/${encodeURIComponent(hotelId)}`
  );
  return data.rooms ?? [];
}

export async function createRoom(input: RoomInput): Promise<RoomDto> {
  const { data } = await apiClient.post<RoomResponse>('/rooms', input);
  return data.room;
}

export async function updateRoom(id: string, input: Partial<RoomInput>): Promise<RoomDto> {
  const { data } = await apiClient.put<RoomResponse>(`/rooms/${encodeURIComponent(id)}`, input);
  return data.room;
}

export async function deleteRoom(id: string): Promise<void> {
  await apiClient.delete(`/rooms/${encodeURIComponent(id)}`);
}

export async function fetchRoomCalendar(
  roomId: string,
  from: string,
  to: string
): Promise<RoomAvailabilityResponse> {
  const { data } = await apiClient.get<RoomAvailabilityResponse>(
    `/rooms/${encodeURIComponent(roomId)}/availability`,
    { params: { from, to } }
  );
  return data;
}

/** Publishes a whole date range in one request (`POST .../availability/bulk`). */
export async function publishAvailability(
  roomId: string,
  input: AvailabilityInput
): Promise<void> {
  await apiClient.post(`/rooms/${encodeURIComponent(roomId)}/availability/bulk`, input);
}

export async function fetchProviderBookings(status?: string): Promise<ProviderBookingDto[]> {
  const { data } = await apiClient.get<ProviderBookingsResponse>('/bookings/provider', {
    params: status ? { status } : undefined,
  });
  return data.bookings ?? [];
}

/**
 * Moves a booking through the server's status machine. The API rejects illegal
 * transitions with `INVALID_STATUS_TRANSITION`, so callers only need to surface
 * the error message.
 */
export async function updateBookingStatus(
  id: string,
  status: BookingStatusValue,
  reason?: string
): Promise<ProviderBookingDto> {
  const { data } = await apiClient.patch<{ success: boolean; booking: ProviderBookingDto }>(
    `/bookings/${encodeURIComponent(id)}/status`,
    reason ? { status, reason } : { status }
  );
  return data.booking;
}
