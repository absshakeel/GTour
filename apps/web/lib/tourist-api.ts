import { apiClient } from '@gtour/utils';
import type { BookingStatusValue } from '@gtour/utils';

/** Nightly price row captured by the server when the booking was created. */
export interface PriceSnapshotDto {
  currency: string;
  nights: number;
  rooms: number;
  price_per_night: number;
  subtotal: number;
  total: number;
  captured_at: string;
}

/** Booking row returned by `GET /bookings/user`, with hotel and room populated. */
export interface TouristBookingDto {
  _id: string;
  booking_reference: string;
  booking_type: 'hotel' | 'photography' | 'vehicle';
  status: BookingStatusValue;
  start_date: string;
  end_date: string;
  guest_count: number;
  room_count: number;
  total_amount: number;
  price_snapshot?: PriceSnapshotDto;
  special_requests?: string;
  cancellation_reason?: string;
  hotel_id?: {
    _id: string;
    name: string;
    address?: string;
    images?: string[];
    destination_id?: { _id: string; name: string } | string;
  } | string;
  hotel_room_id?: {
    _id: string;
    room_type: string;
    bed_type?: string;
    price_per_night?: number;
  } | string;
  created_at: string;
  updated_at: string;
}

export interface PaymentDto {
  _id: string;
  booking_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference?: string;
  payment_date?: string;
}

export async function fetchMyBookings(): Promise<TouristBookingDto[]> {
  const { data } = await apiClient.get<{ success: boolean; bookings: TouristBookingDto[] }>(
    '/bookings/user'
  );
  return data.bookings ?? [];
}

/**
 * Payment rows are not scoped by owner on the server, so only call this for a
 * booking the caller already knows belongs to them.
 */
export async function fetchBookingPayment(bookingId: string): Promise<PaymentDto | null> {
  try {
    const { data } = await apiClient.get<{ success: boolean; payment: PaymentDto }>(
      `/payments/booking/${encodeURIComponent(bookingId)}`
    );
    return data.payment ?? null;
  } catch {
    return null;
  }
}