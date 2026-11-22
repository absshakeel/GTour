import { Response, NextFunction } from 'express';
import Booking from '../models/Booking';
import Room from '../models/Room';
import Hotel from '../models/Hotel';
import Payment from '../models/Payment';
import { bookingStatusSchema, createBookingSchema } from '@gtour/validation';
import { BookingStatus, UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { eachNight, normaliseStayRange } from '../utils/dates';
import { quoteStay, releaseNights, reserveNights } from '../services/availability.service';
import {
  canTransition,
  describeAllowedTransitions,
  releasesInventory,
} from '../services/bookingWorkflow';

const MAX_ROOMS_PER_BOOKING = 20;

function bookingReference(): string {
  return `BTG-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

/**
 * Creates a hotel booking.
 *
 * The server owns the whole transaction: it re-reads the room, validates the
 * stay, prices it from live inventory, holds the nights atomically, and only
 * then persists the booking with that price snapshot. A client-supplied
 * `total_amount` is accepted for compatibility but must match the server total.
 */
export const createBooking = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const data = parseOrThrow(createBookingSchema, req.body);

    if (data.booking_type !== 'hotel' || !data.hotel_room_id) {
      throw new ApiError(
        'Only hotel bookings are supported at this time',
        400,
        'UNSUPPORTED_BOOKING_TYPE'
      );
    }

    const roomId = assertObjectId(data.hotel_room_id, 'room id');
    const room = await Room.findById(roomId);
    if (!room) {
      throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const { start, end, nights } = normaliseStayRange(data.start_date, data.end_date);
    if (start.getTime() < Date.now() - 86_400_000) {
      throw new ApiError('Check-in date cannot be in the past', 400, 'INVALID_DATES');
    }

    const rooms = Math.max(1, Math.min(MAX_ROOMS_PER_BOOKING, data.room_count ?? 1));
    const quote = await quoteStay(room, start, end, rooms, data.guest_count);

    if (!quote.available) {
      throw new ApiError('No rooms available for the selected dates', 409, 'NO_AVAILABILITY');
    }

    // The client figure is only a cross-check — the server total is stored.
    if (data.total_amount !== undefined && Math.abs(data.total_amount - quote.total) > 0.01) {
      throw new ApiError('Booking total does not match the server price', 400, 'PRICE_MISMATCH', {
        expected: quote.total,
        received: data.total_amount,
      });
    }

    await reserveNights(room, start, end, rooms);

    try {
      const booking = await Booking.create({
        booking_reference: bookingReference(),
        booking_type: 'hotel',
        start_date: start,
        end_date: end,
        guest_count: data.guest_count,
        room_count: rooms,
        total_amount: quote.total,
        price_snapshot: {
          currency: quote.currency,
          nights,
          rooms,
          price_per_night: quote.price_per_night,
          subtotal: quote.subtotal,
          total: quote.total,
          nightly: quote.nightly.map(({ date, price_per_night }) => ({ date, price_per_night })),
          captured_at: new Date(),
        },
        status: BookingStatus.PENDING,
        special_requests: data.special_requests,
        user_id: req.user.userId,
        hotel_id: room.hotel_id,
        hotel_room_id: room._id,
      });

      await Payment.create({
        booking_id: booking._id,
        amount: quote.total,
        currency: quote.currency,
        payment_method: 'pending',
        payment_status: 'pending',
      });

      res.status(201).json({ success: true, booking });
    } catch (error) {
      // The nights were held for a booking that never persisted — hand them back.
      await releaseNights(room, eachNight(start, end), rooms);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/** True when the caller owns the hotel the booking belongs to. */
async function canManageBooking(req: AuthRequest, booking: { hotel_id?: unknown }): Promise<boolean> {
  if (!req.user || !booking.hotel_id) return false;
  if (req.user.role === UserRole.ADMIN) return true;

  const hotel = await Hotel.findById(booking.hotel_id).select('owner_id');
  return Boolean(hotel && String(hotel.owner_id) === req.user.userId);
}

export const getBookingById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const id = assertObjectId(req.params.id, 'booking id');
    const booking = await Booking.findById(id)
      .populate('user_id', 'name email')
      .populate('hotel_room_id')
      .populate('hotel_id', 'name address');

    if (!booking) {
      throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const isGuest = String(booking.user_id) === req.user.userId;
    const isProvider = await canManageBooking(req, booking);
    if (!isGuest && !isProvider && req.user.role !== UserRole.ADMIN) {
      throw new ApiError('Not authorized to access this booking', 403, 'FORBIDDEN');
    }

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

export const getUserBookings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const bookings = await Booking.find({ user_id: req.user.userId })
      .populate('hotel_room_id')
      // The destination is what the traveller thinks in, so the dashboard needs
      // it alongside the hotel. The nested populate keeps the shape shallow.
      .populate({
        path: 'hotel_id',
        select: 'name address images destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .sort({ created_at: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider booking queue. Only returns bookings for hotels the caller owns, so
 * a hotel owner can never read another property's guest list.
 */
export const getProviderBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const requested = req.query.status;
    const status =
      typeof requested === 'string' && Object.values(BookingStatus).includes(requested as BookingStatus)
        ? (requested as BookingStatus)
        : undefined;

    const hotelIds =
      req.user.role === UserRole.ADMIN
        ? undefined
        : ((await Hotel.distinct('_id', { owner_id: req.user.userId })) as unknown[]);

    if (hotelIds && hotelIds.length === 0) {
      res.json({ success: true, bookings: [] });
      return;
    }

    const bookings = await Booking.find({
      booking_type: 'hotel',
      ...(hotelIds ? { hotel_id: { $in: hotelIds } } : {}),
      ...(status ? { status } : {}),
    })
      .populate('user_id', 'name email')
      .populate('hotel_room_id', 'room_type bed_type price_per_night')
      .populate({ path: 'hotel_id', select: 'name address destination_id', populate: { path: 'destination_id', select: 'name' } })
      .sort({ start_date: 1 });

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * Status update shared by guests and providers. A guest may only cancel their
 * own booking; a provider may confirm, complete, cancel or flag a no-show on
 * their own property.
 */
export const updateBookingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const id = assertObjectId(req.params.id, 'booking id');
    const data = parseOrThrow(bookingStatusSchema, req.body);

    const booking = await Booking.findById(id);
    if (!booking) {
      throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const isGuest = String(booking.user_id) === req.user.userId;
    const isProvider = await canManageBooking(req, booking);

    if (!isGuest && !isProvider) {
      throw new ApiError('Not authorized to update this booking', 403, 'FORBIDDEN');
    }
    if (isGuest && !isProvider && data.status !== BookingStatus.CANCELLED) {
      throw new ApiError('Guests can only cancel a booking', 403, 'FORBIDDEN');
    }

    const from = booking.status;
    if (!canTransition(from, data.status)) {
      throw new ApiError(
        `Cannot move a booking from ${from} to ${data.status}`,
        409,
        'INVALID_STATUS_TRANSITION',
        { allowed: describeAllowedTransitions(from) }
      );
    }

    // Release inventory before flipping the status so a failed release cannot
    // leave a cancelled booking still holding rooms.
    if (releasesInventory(from, data.status) && booking.hotel_room_id) {
      const room = await Room.findById(booking.hotel_room_id);
      if (room) {
        await releaseNights(
          room,
          eachNight(booking.start_date, booking.end_date),
          booking.room_count ?? 1
        );
      }
    }

    booking.status = data.status;
    if (data.status === BookingStatus.CANCELLED) {
      booking.cancelled_at = new Date();
      booking.cancellation_reason = data.reason;
    }
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

/** Backwards-compatible cancel endpoint: a thin wrapper over the workflow. */
export const cancelBooking = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  req.body = { status: BookingStatus.CANCELLED, reason: req.body?.reason };
  return updateBookingStatus(req, res, next);
};

/** Guests may still edit free-text notes while a booking is pending. */
export const updateBooking = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const id = assertObjectId(req.params.id, 'booking id');
    const booking = await Booking.findById(id);
    if (!booking) {
      throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (String(booking.user_id) !== req.user.userId) {
      throw new ApiError('Not authorized to update this booking', 403, 'FORBIDDEN');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ApiError('Only pending bookings can be edited', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (typeof req.body?.special_requests === 'string') {
      booking.special_requests = req.body.special_requests.slice(0, 500);
    }
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};