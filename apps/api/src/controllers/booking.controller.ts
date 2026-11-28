import { Response, NextFunction } from 'express';
import Booking from '../models/Booking';
import Hotel from '../models/Hotel';
import Room from '../models/Room';
import Payment from '../models/Payment';
import PhotographyService from '../models/PhotographyService';
import Vehicle from '../models/Vehicle';
import {
  bookingQueueSchema,
  bookingStatusSchema,
  createBookingSchema,
  type CreateBookingInput,
} from '@gtour/validation';
import { BookingStatus, PaymentPolicy, UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { eachNight, normaliseStayRange } from '../utils/dates';
import { currencyCode } from '../config/currency';
import { quoteStay, releaseNights, reserveNights } from '../services/availability.service';
import { canManageBooking, ownedResources } from '../services/bookingAccess.service';
import {
  quoteRental,
  releaseVehicleUnits,
  reserveVehicleUnits,
} from '../services/vehicleAvailability.service';
import {
  canTransition,
  describeAllowedTransitions,
  releasesInventory,
} from '../services/bookingWorkflow';
import { loadBookingContext } from '../services/notification/bookingContext.service';
import { notify } from '../services/notification/notify.service';
import {
  bookingCreatedGuest,
  bookingCreatedProvider,
  bookingStatusGuest,
  bookingStatusProvider,
} from '../services/notification/bookingTemplates.service';

const MAX_ROOMS_PER_BOOKING = 20;
const MAX_VEHICLES_PER_BOOKING = 10;

function bookingReference(): string {
  return `BTG-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

type CreateInput = CreateBookingInput;

/** Rejects a client total that disagrees with the server's own figure. */
function assertPriceMatches(clientTotal: number | undefined, serverTotal: number): void {
  if (clientTotal !== undefined && Math.abs(clientTotal - serverTotal) > 0.01) {
    throw new ApiError('Booking total does not match the server price', 400, 'PRICE_MISMATCH', {
      expected: serverTotal,
      received: clientTotal,
    });
  }
}

function assertFutureStart(start: Date, label: string): void {
  if (start.getTime() < Date.now() - 86_400_000) {
    throw new ApiError(`${label} cannot be in the past`, 400, 'INVALID_DATES');
  }
}

/** Persists the booking and its pending payment row together. */
async function persistBooking(
  req: AuthRequest,
  payload: Parameters<typeof Booking.create>[0],
  amount: number,
  currency: string,
) {
  const booking = await Booking.create(payload);
  await Payment.create({
    booking_id: booking._id,
    amount,
    currency,
    payment_method: 'pending',
    payment_status: 'pending',
  });
  return booking;
}

/**
 * Hotel branch: re-reads the room, prices the stay from live inventory, holds
 * the nights atomically, then persists the booking with that price snapshot.
 */
async function createHotelBooking(req: AuthRequest, data: CreateInput) {
  const roomId = assertObjectId(data.hotel_room_id!, 'room id');
  const room = await Room.findById(roomId);
  if (!room) {
    throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  const { start, end, nights } = normaliseStayRange(data.start_date, data.end_date);
  assertFutureStart(start, 'Check-in date');

  const rooms = Math.max(1, Math.min(MAX_ROOMS_PER_BOOKING, data.room_count ?? 1));
  const quote = await quoteStay(room, start, end, rooms, data.guest_count);

  if (!quote.available) {
    throw new ApiError('No rooms available for the selected dates', 409, 'NO_AVAILABILITY');
  }

  assertPriceMatches(data.total_amount, quote.total);
  await reserveNights(room, start, end, rooms);

  // The property's policy is copied onto the booking so a later policy change
  // cannot alter what this guest already agreed to.
  const hotel = await Hotel.findById(room.hotel_id).select('payment_policy').lean();

  try {
    return await persistBooking(
      req,
      {
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
        payment_policy: hotel?.payment_policy ?? PaymentPolicy.PAY_ON_CONFIRMATION,
        user_id: req.user!.userId,
        hotel_id: room.hotel_id,
        hotel_room_id: room._id,
      },
      quote.total,
      quote.currency,
    );
  } catch (error) {
    // The nights were held for a booking that never persisted — hand them back.
    await releaseNights(room, eachNight(start, end), rooms);
    throw error;
  }
}

/**
 * Photography branch: a shoot is a single dated session, so the booking window
 * is one day and there is no inventory to hold. The service must exist and be
 * active, and the price is always the provider's current `price_per_session`.
 */
async function createPhotographyBooking(req: AuthRequest, data: CreateInput) {
  const serviceId = assertObjectId(data.photography_service_id!, 'service id');
  const service = await PhotographyService.findById(serviceId);
  if (!service || service.is_active === false) {
    throw new ApiError('Photography service not found', 404, 'SERVICE_NOT_FOUND');
  }

  const { start, end, nights } = normaliseStayRange(data.start_date, data.end_date);
  assertFutureStart(start, 'Session date');

  if (nights > 14) {
    throw new ApiError('A photography booking cannot exceed 14 days', 400, 'STAY_TOO_LONG');
  }

  const total = service.price_per_session * nights;
  assertPriceMatches(data.total_amount, total);

  return persistBooking(
    req,
    {
      booking_reference: bookingReference(),
      booking_type: 'photography',
      start_date: start,
      end_date: end,
      guest_count: data.guest_count,
      room_count: 1,
      total_amount: total,
      price_snapshot: {
        currency: currencyCode(),
        nights,
        rooms: 1,
        price_per_night: service.price_per_session,
        subtotal: total,
        total,
        nightly: eachNight(start, end).map((date) => ({
          date: date.toISOString().slice(0, 10),
          price_per_night: service.price_per_session,
        })),
        captured_at: new Date(),
      },
      status: BookingStatus.PENDING,
      special_requests: data.special_requests,
      user_id: req.user!.userId,
      photography_service_id: service._id,
    },
    total,
    currencyCode(),
  );
}

/**
 * Vehicle branch: `room_count` doubles as the number of identical vehicles the
 * traveller wants, matched against the fleet size the provider published.
 */
async function createVehicleBooking(req: AuthRequest, data: CreateInput) {
  const vehicleId = assertObjectId(data.vehicle_id!, 'vehicle id');
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }

  const { start, end, nights } = normaliseStayRange(data.start_date, data.end_date);
  assertFutureStart(start, 'Pick-up date');

  const units = Math.max(1, Math.min(MAX_VEHICLES_PER_BOOKING, data.room_count ?? 1));
  if (data.guest_count > vehicle.capacity * units) {
    throw new ApiError(
      `This vehicle seats ${vehicle.capacity} passengers; ${units} unit(s) cannot host ${data.guest_count} guests`,
      400,
      'CAPACITY_EXCEEDED',
    );
  }

  const quote = await quoteRental(vehicle, start, end, units);
  if (!quote.available) {
    throw new ApiError('No vehicles available for the selected dates', 409, 'NO_AVAILABILITY');
  }

  assertPriceMatches(data.total_amount, quote.total);
  await reserveVehicleUnits(vehicle, start, end, units);

  try {
    return await persistBooking(
      req,
      {
        booking_reference: bookingReference(),
        booking_type: 'vehicle',
        start_date: start,
        end_date: end,
        guest_count: data.guest_count,
        room_count: units,
        total_amount: quote.total,
        price_snapshot: {
          currency: quote.currency,
          nights,
          rooms: units,
          price_per_night: quote.price_per_day,
          subtotal: quote.subtotal,
          total: quote.total,
          nightly: quote.nightly.map(({ date, price_per_day }) => ({
            date,
            price_per_night: price_per_day,
          })),
          captured_at: new Date(),
        },
        status: BookingStatus.PENDING,
        special_requests: data.special_requests,
        user_id: req.user!.userId,
        vehicle_id: vehicle._id,
      },
      quote.total,
      quote.currency,
    );
  } catch (error) {
    await releaseVehicleUnits(vehicle, eachNight(start, end), units);
    throw error;
  }
}

/**
 * Creates a booking for any of the three bookable resources.
 *
 * The server owns the whole transaction in every branch: it re-reads the
 * resource, validates the dates, prices it from live state, holds the
 * inventory, and only then persists the booking with that price snapshot. A
 * client-supplied `total_amount` is accepted for compatibility but must match
 * the server total.
 */
export const createBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const data = parseOrThrow(createBookingSchema, req.body);

    const booking =
      data.booking_type === 'hotel'
        ? await createHotelBooking(req, data)
        : data.booking_type === 'photography'
          ? await createPhotographyBooking(req, data)
          : await createVehicleBooking(req, data);

    // Notifications run after the booking is committed and never throw, so a
    // mail outage cannot turn an accepted booking into an error response.
    await notifyBookingCreated(booking._id);

    res.status(201).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

/**
 * True when the caller owns the resource a booking belongs to.
 *
 * Each booking type resolves ownership through its own provider record, so a
 * photographer can never see a vehicle rental and an admin sees everything.
 */
/** Gives held inventory back for whichever resource the booking was made on. */
async function releaseBookingInventory(booking: {
  booking_type?: string;
  hotel_room_id?: unknown;
  hotel_id?: unknown;
  vehicle_id?: unknown;
  start_date: Date;
  end_date: Date;
  room_count?: number;
}): Promise<void> {
  const units = booking.room_count ?? 1;

  if (booking.hotel_room_id) {
    const room = await Room.findById(booking.hotel_room_id);
    if (room) {
      await releaseNights(room, eachNight(booking.start_date, booking.end_date), units);
    }
    return;
  }

  if (booking.vehicle_id) {
    const vehicle = await Vehicle.findById(booking.vehicle_id);
    if (vehicle) {
      await releaseVehicleUnits(vehicle, eachNight(booking.start_date, booking.end_date), units);
    }
  }

  // Photography bookings hold no inventory, so there is nothing to release.
}

export const getBookingById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const id = assertObjectId(req.params.id, 'booking id');
    const booking = await Booking.findById(id)
      .populate('user_id', 'name email')
      .populate('hotel_room_id')
      .populate({
        path: 'photography_service_id',
        select: 'name images price_per_session duration_hours destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'vehicle_id',
        select: 'name images type capacity price_per_day destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'hotel_id',
        select: 'name address destination_id',
        populate: { path: 'destination_id', select: 'name' },
      });

    if (!booking) {
      throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const isGuest = String(booking.user_id) === req.user.userId;
    const isProvider = await canManageBooking(req.user, booking);
    if (!isGuest && !isProvider && req.user.role !== UserRole.ADMIN) {
      throw new ApiError('Not authorized to access this booking', 403, 'FORBIDDEN');
    }

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

export const getUserBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const bookings = await Booking.find({ user_id: req.user.userId })
      .populate('hotel_room_id')
      .populate({
        path: 'photography_service_id',
        select: 'name images price_per_session duration_hours destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'vehicle_id',
        select: 'name images type capacity price_per_day destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      // The destination is what the traveller thinks in, so the dashboard needs
      // it alongside the hotel. The nested populate keeps the shape shallow.
      .populate({
        path: 'hotel_id',
        select: 'name address images destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider booking queue across all three bookable resource types. Only
 * returns bookings for resources the caller owns, so a photographer can never
 * read a hotel's guest list.
 */
export const getProviderBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const requested = req.query.status;
    const status =
      typeof requested === 'string' &&
      Object.values(BookingStatus).includes(requested as BookingStatus)
        ? (requested as BookingStatus)
        : undefined;

    const owned = req.user.role === UserRole.ADMIN ? undefined : await ownedResources(req.user!);

    if (owned && owned.hotelIds.length + owned.serviceIds.length + owned.vehicleIds.length === 0) {
      res.json({ success: true, bookings: [] });
      return;
    }

    const scope = owned
      ? {
          $or: [
            { hotel_id: { $in: owned.hotelIds } },
            { photography_service_id: { $in: owned.serviceIds } },
            { vehicle_id: { $in: owned.vehicleIds } },
          ],
        }
      : {};

    const bookings = await Booking.find({
      ...(status ? { status } : {}),
      ...scope,
    })
      .populate('user_id', 'name email')
      .populate('hotel_room_id', 'room_type bed_type price_per_night')
      .populate({
        path: 'photography_service_id',
        select: 'name images price_per_session duration_hours destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'vehicle_id',
        select: 'name images type capacity price_per_day destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'hotel_id',
        select: 'name address destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .sort({ start_date: 1 });

    // The queue doubles as a settlement view: an owner needs to see whether a
    // booking was actually paid before releasing rooms. One query, then a lookup
    // map, rather than a per-row round trip.
    const payments = bookings.length
      ? await Payment.find({ booking_id: { $in: bookings.map((booking) => booking._id) } }).select(
          'booking_id amount amount_minor currency payment_status payment_method',
        )
      : [];

    const paymentByBooking = new Map(
      payments.map((payment) => [String(payment.booking_id), payment]),
    );

    res.json({
      success: true,
      bookings: bookings.map((booking) => ({
        ...booking.toObject(),
        payment: paymentByBooking.get(String(booking._id)) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin booking queue: every booking on the platform, paginated, with status,
 * type, search and date-range filters. Providers keep using
 * `GET /bookings/provider`, which scopes rows to resources they own.
 */
export const listBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = parseOrThrow(bookingQueueSchema, req.query);

    const filters: Record<string, unknown> = {};

    if (parsed.status) filters.status = parsed.status;
    if (parsed.booking_type) filters.booking_type = parsed.booking_type;

    if (parsed.date_from || parsed.date_to) {
      filters.start_date = {
        ...(parsed.date_from ? { $gte: new Date(parsed.date_from) } : {}),
        ...(parsed.date_to ? { $lte: new Date(parsed.date_to) } : {}),
      };
    }

    if (parsed.search) {
      // The reference is the only free-text field an operator can read off a
      // support ticket, so match it case-insensitively.
      filters.booking_reference = { $regex: parsed.search, $options: 'i' };
    }

    const total = await Booking.countDocuments(filters);
    const pages = Math.ceil(total / parsed.limit) || 0;

    const bookings = await Booking.find(filters)
      .populate('user_id', 'name email')
      .populate('hotel_room_id', 'room_type bed_type price_per_night')
      .populate({
        path: 'photography_service_id',
        select: 'name images price_per_session duration_hours destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'vehicle_id',
        select: 'name images type capacity price_per_day destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .populate({
        path: 'hotel_id',
        select: 'name address destination_id',
        populate: { path: 'destination_id', select: 'name' },
      })
      .sort({ start_date: -1 })
      .skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit);

    res.json({
      success: true,
      bookings,
      pagination: { page: parsed.page, limit: parsed.limit, total, pages },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tells both sides that a booking was requested.
 *
 * Wrapped in a try/catch even though `notify` never throws: the context loader
 * issues several reads, and a booking must not fail to be created because one of
 * those lookups misbehaved.
 */
async function notifyBookingCreated(bookingId: unknown): Promise<void> {
  try {
    const context = await loadBookingContext(String(bookingId));
    if (!context) return;

    if (context.guestId) await notify(bookingCreatedGuest(context));
    const providerNotice = bookingCreatedProvider(context);
    if (providerNotice) await notify(providerNotice);
  } catch {
    // Notification is a side effect; the booking is already saved.
  }
}

/** Tells the guest and the provider about a status change, each in their own voice. */
async function notifyBookingStatus(
  bookingId: unknown,
  status: BookingStatus,
  reason?: string,
): Promise<void> {
  try {
    const context = await loadBookingContext(String(bookingId));
    if (!context) return;

    if (context.guestId) await notify(bookingStatusGuest(context, status, reason));

    const providerNotice = bookingStatusProvider(context, status, reason);
    if (providerNotice) await notify(providerNotice);
  } catch {
    // See notifyBookingCreated.
  }
}

/**
 * Status update shared by guests and providers. A guest may only cancel their
 * own booking; a provider may confirm, complete, cancel or flag a no-show on
 * their own property.
 */
export const updateBookingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
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
    const isProvider = await canManageBooking(req.user, booking);

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
        { allowed: describeAllowedTransitions(from) },
      );
    }

    // Release inventory before flipping the status so a failed release cannot
    // leave a cancelled booking still holding resource units.
    if (releasesInventory(from, data.status)) {
      await releaseBookingInventory(booking);
    }

    booking.status = data.status;
    if (data.status === BookingStatus.CANCELLED) {
      booking.cancelled_at = new Date();
      booking.cancellation_reason = data.reason;
    }
    await booking.save();

    await notifyBookingStatus(booking._id, data.status, data.reason);

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

/** Backwards-compatible cancel endpoint: a thin wrapper over the workflow. */
export const cancelBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  req.body = { status: BookingStatus.CANCELLED, reason: req.body?.reason };
  return updateBookingStatus(req, res, next);
};

/** Guests may still edit free-text notes while a booking is pending. */
export const updateBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
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
