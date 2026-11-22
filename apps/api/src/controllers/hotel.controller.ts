import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Hotel from '../models/Hotel';
import Room from '../models/Room';
import RoomAvailability from '../models/RoomAvailability';
import Booking from '../models/Booking';
import { createHotelSchema, hotelSearchSchema, updateHotelSchema, HotelSearchInput } from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { eachNight, normaliseStayRange } from '../utils/dates';

const SORT_FIELDS: Record<string, string> = {
  rating: 'rating',
  name: 'name',
  created_at: 'createdAt',
};

/** Cheapest and most expensive nightly rate per hotel, derived from its rooms. */
async function priceRangesFor(hotelIds: mongoose.Types.ObjectId[]) {
  if (hotelIds.length === 0) return new Map<string, { min: number; max: number }>();

  const rows = await Room.aggregate<{ _id: mongoose.Types.ObjectId; min: number; max: number }>([
    { $match: { hotel_id: { $in: hotelIds } } },
    {
      $group: {
        _id: '$hotel_id',
        min: { $min: '$price_per_night' },
        max: { $max: '$price_per_night' },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id.toString(), { min: row.min, max: row.max }]));
}

/** Adds `price_from` / `price_to` so the UI can render "from $X". */
async function withPriceRanges<T extends { _id: mongoose.Types.ObjectId }>(hotels: T[]) {
  const ranges = await priceRangesFor(hotels.map((hotel) => hotel._id));

  return hotels.map((hotel) => ({
    ...(typeof (hotel as { toObject?: unknown }).toObject === 'function'
      ? (hotel as unknown as { toObject: () => object }).toObject()
      : hotel),
    price_from: ranges.get(String(hotel._id))?.min ?? null,
    price_to: ranges.get(String(hotel._id))?.max ?? null,
  }));
}

/**
 * Price, capacity and guest filters live on rooms, not on the hotel document.
 * Resolving them into a hotel id set keeps the list endpoint to a single
 * indexed hotel query instead of a lookup per result.
 *
 * When a stay window is supplied the room set is narrowed further to the rooms
 * that are actually free. A room is free when, for every night of the stay, it
 * either has no override row (so its own `total_rooms` inventory applies) or an
 * override that is not sold out and still has inventory. A single `$all` over
 * one inner `$or` expresses that in one query instead of a per-night loop.
 */
async function hotelIdsMatchingRooms(parsed: HotelSearchInput) {
  const roomFilter: Record<string, unknown> = {};
  const hasRoomFilter =
    parsed.min_price !== undefined || parsed.max_price !== undefined || parsed.guests !== undefined;

  if (parsed.min_price !== undefined || parsed.max_price !== undefined) {
    roomFilter.price_per_night = {
      ...(parsed.min_price !== undefined ? { $gte: parsed.min_price } : {}),
      ...(parsed.max_price !== undefined ? { $lte: parsed.max_price } : {}),
    };
  }
  if (parsed.guests !== undefined) {
    roomFilter.capacity = { $gte: parsed.guests };
  }

  const stayWindow =
    parsed.check_in && parsed.check_out
      ? normaliseStayRange(parsed.check_in, parsed.check_out)
      : null;

  if (stayWindow) {
    const nights = eachNight(stayWindow.start, stayWindow.end);

    const soldOutIds = await RoomAvailability.distinct('room_id', {
      date: { $in: nights },
      $or: [{ status: 'unavailable' }, { available_rooms: { $lt: 1 } }],
    });

    roomFilter._id = { $nin: soldOutIds as mongoose.Types.ObjectId[] };
  }

  if (!hasRoomFilter && !stayWindow) return null;

  return (await Room.distinct('hotel_id', roomFilter)) as mongoose.Types.ObjectId[];
}

/** Hotel ids ordered by their cheapest room, used for `sort_by=price`. */
async function hotelIdsOrderedByPrice(hotelIds: mongoose.Types.ObjectId[]) {
  const rows = await Room.aggregate<{ _id: mongoose.Types.ObjectId; price: number }>([
    { $match: { hotel_id: { $in: hotelIds } } },
    { $group: { _id: '$hotel_id', price: { $min: '$price_per_night' } } },
    { $sort: { price: 1 } },
  ]);
  return rows.map((row) => row._id);
}

async function buildHotelQuery(parsed: HotelSearchInput): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = {};

  if (parsed.destination_id) {
    query.destination_id = assertObjectId(parsed.destination_id, 'destination id');
  }
  if (parsed.min_rating !== undefined) {
    query.rating = { $gte: parsed.min_rating };
  }
  if (parsed.search) {
    query.$text = { $search: parsed.search };
  }

  const roomMatchedIds = await hotelIdsMatchingRooms(parsed);
  if (roomMatchedIds) {
    query._id = { $in: roomMatchedIds };
  }

  return query;
}

/**
 * Public hotel list. Supports the same filters as /search and paginates with a
 * stable sort so the browse UI can page through results.
 */
export const getAllHotels = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = parseOrThrow(hotelSearchSchema, req.query);

    // A half-specified stay cannot be evaluated, so it is rejected rather than
    // silently ignored — otherwise the UI would show rooms that are not free.
    if (Boolean(parsed.check_in) !== Boolean(parsed.check_out)) {
      throw new ApiError(
        'check_in and check_out must be provided together',
        400,
        'INVALID_DATES'
      );
    }

    const query = await buildHotelQuery(parsed);

    const populate = { path: 'destination_id', select: 'name country region' };
    const skip = (parsed.page - 1) * parsed.limit;

    let hotels: { _id: mongoose.Types.ObjectId }[];
    let total: number;

    if (parsed.sort_by === 'price') {
      const matchingIds = (await Hotel.find(query).distinct('_id')) as mongoose.Types.ObjectId[];
      total = matchingIds.length;

      const ordered = await hotelIdsOrderedByPrice(matchingIds);
      const pageIds = ordered.slice(skip, skip + parsed.limit);
      const documents = await Hotel.find({ _id: { $in: pageIds } }).populate(populate);

      // Restore the price order that Mongo cannot express through `find`.
      const byId = new Map(documents.map((document) => [String(document._id), document]));
      hotels = pageIds
        .map((id) => byId.get(String(id)))
        .filter((document): document is NonNullable<typeof document> => Boolean(document));
    } else {
      const sort: Record<string, 1 | -1> = {};
      sort[SORT_FIELDS[parsed.sort_by] ?? 'createdAt'] = parsed.sort_order === 'asc' ? 1 : -1;

      [hotels, total] = await Promise.all([
        Hotel.find(query).populate(populate).sort(sort).skip(skip).limit(parsed.limit),
        Hotel.countDocuments(query),
      ]);
    }

    res.json({
      success: true,
      hotels: await withPriceRanges(hotels),
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        pages: Math.ceil(total / parsed.limit) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const searchHotels = getAllHotels;

export const getHotelById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'hotel id');
    const hotel = await Hotel.findById(id).populate('destination_id', 'name country region');

    if (!hotel) {
      throw new ApiError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
    }

    const [withPrices] = await withPriceRanges([hotel]);
    res.json({ success: true, hotel: withPrices });
  } catch (error) {
    next(error);
  }
};

/** The authenticated owner's own properties — the dashboard entry point. */
export const getMyHotels = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const hotels = await Hotel.find({ owner_id: req.user.userId })
      .populate('destination_id', 'name country region')
      .sort({ createdAt: -1 });

    res.json({ success: true, hotels: await withPriceRanges(hotels) });
  } catch (error) {
    next(error);
  }
};

/** Loads a hotel and enforces that the caller owns it (or is an admin). */
async function loadOwnedHotel(req: AuthRequest, id: string) {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const hotel = await Hotel.findById(id);
  if (!hotel) {
    throw new ApiError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
  }
  if (req.user.role !== UserRole.ADMIN && String(hotel.owner_id) !== req.user.userId) {
    throw new ApiError('Not authorized to modify this hotel', 403, 'FORBIDDEN');
  }

  return hotel;
}

export const createHotel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const data = parseOrThrow(createHotelSchema, req.body);

    // owner_id always comes from the token, never from the request body.
    const hotel = await Hotel.create({
      ...data,
      destination_id: assertObjectId(data.destination_id, 'destination id'),
      owner_id: req.user.userId,
    });

    res.status(201).json({ success: true, hotel });
  } catch (error) {
    next(error);
  }
};

export const updateHotel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'hotel id');
    const data = parseOrThrow(updateHotelSchema, req.body);
    const hotel = await loadOwnedHotel(req, id);

    if (data.destination_id) {
      data.destination_id = assertObjectId(data.destination_id, 'destination id');
    }

    Object.assign(hotel, data);
    await hotel.save();

    res.json({ success: true, hotel });
  } catch (error) {
    next(error);
  }
};

export const deleteHotel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'hotel id');
    const hotel = await loadOwnedHotel(req, id);

    // Deleting a property underneath active bookings would orphan them, so the
    // owner has to resolve those bookings first.
    const roomIds = await Room.distinct('_id', { hotel_id: hotel._id });
    const activeBookings = await Booking.countDocuments({
      booking_type: 'hotel',
      status: { $in: ['pending', 'confirmed'] },
      hotel_room_id: { $in: roomIds },
    });

    if (activeBookings > 0) {
      throw new ApiError(
        'Hotel has active bookings and cannot be deleted',
        409,
        'HOTEL_HAS_ACTIVE_BOOKINGS'
      );
    }

    await Room.deleteMany({ hotel_id: hotel._id });
    await hotel.deleteOne();

    res.json({ success: true, message: 'Hotel deleted successfully' });
  } catch (error) {
    next(error);
  }
};
