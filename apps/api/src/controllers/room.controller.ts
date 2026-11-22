import { Response, NextFunction } from 'express';
import Room from '../models/Room';
import Hotel from '../models/Hotel';
import RoomAvailability from '../models/RoomAvailability';
import {
  bulkRoomAvailabilitySchema,
  createRoomAvailabilitySchema,
  createRoomSchema,
  roomAvailabilityQuerySchema,
  roomQuoteSchema,
  updateRoomSchema,
} from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { eachNight, normaliseStayRange, parseDateInput, startOfUtcDay } from '../utils/dates';
import { loadNightlyAvailability, quoteStay } from '../services/availability.service';

/** Rooms are public to read, but every mutation is scoped to the hotel owner. */
async function assertHotelOwner(req: AuthRequest, hotelId: string): Promise<void> {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const hotel = await Hotel.findById(hotelId).select('owner_id');
  if (!hotel) {
    throw new ApiError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
  }
  if (req.user.role !== UserRole.ADMIN && String(hotel.owner_id) !== req.user.userId) {
    throw new ApiError('Not authorized to manage rooms for this hotel', 403, 'FORBIDDEN');
  }
}

/** Loads a room and checks that its parent hotel belongs to the caller. */
async function loadOwnedRoom(req: AuthRequest, roomId: string) {
  const room = await Room.findById(roomId);
  if (!room) {
    throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
  }
  await assertHotelOwner(req, String(room.hotel_id));
  return room;
}

export const getRoomsByHotel = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const hotelId = assertObjectId(req.params.hotelId, 'hotel id');
    const rooms = await Room.find({ hotel_id: hotelId }).sort({ price_per_night: 1 });

    res.json({ success: true, rooms });
  } catch (error) {
    next(error);
  }
};

export const getRoomById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const room = await Room.findById(id);

    if (!room) {
      throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    res.json({ success: true, room });
  } catch (error) {
    next(error);
  }
};

export const createRoom = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = parseOrThrow(createRoomSchema, req.body);
    const hotelId = assertObjectId(data.hotel_id, 'hotel id');
    await assertHotelOwner(req, hotelId);

    const room = await Room.create({ ...data, hotel_id: hotelId });

    res.status(201).json({ success: true, room });
  } catch (error) {
    next(error);
  }
};

export const updateRoom = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const data = parseOrThrow(updateRoomSchema, req.body);
    const room = await loadOwnedRoom(req, id);

    Object.assign(room, data);
    await room.save();

    res.json({ success: true, room });
  } catch (error) {
    next(error);
  }
};

export const deleteRoom = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const room = await loadOwnedRoom(req, id);

    await RoomAvailability.deleteMany({ room_id: room._id });
    await room.deleteOne();

    res.json({ success: true, message: 'Room deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Booking calendar for a room. Every night in the requested window is returned,
 * including nights with no stored override, so the UI renders a continuous
 * calendar instead of only the dates a provider happened to edit.
 */
export const getRoomAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const query = parseOrThrow(roomAvailabilityQuerySchema, req.query);

    const room = await Room.findById(id);
    if (!room) {
      throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const from = query.from ? parseDateInput(query.from, 'from date') : startOfUtcDay(new Date());
    const to = query.to
      ? parseDateInput(query.to, 'to date')
      : new Date(from.getTime() + 30 * 86_400_000);
    const { end } = normaliseStayRange(from, to, 120);

    res.json({
      success: true,
      room_id: id,
      from: from.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      nights: await loadNightlyAvailability(room, from, end),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authoritative price quote for a stay. The booking UI calls this before
 * creating a booking so the total it shows is the server's number.
 */
export const getRoomQuote = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const query = parseOrThrow(roomQuoteSchema, req.query);

    const room = await Room.findById(id);
    if (!room) {
      throw new ApiError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const quote = await quoteStay(room, query.check_in, query.check_out, query.rooms, query.guests);
    res.json({ success: true, quote });
  } catch (error) {
    next(error);
  }
};

/** Upsert a single night's availability. */
export const createRoomAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const data = parseOrThrow(createRoomAvailabilitySchema, req.body);
    const room = await loadOwnedRoom(req, id);

    if (data.room_id && data.room_id !== id) {
      throw new ApiError('room_id does not match the request path', 400, 'ROOM_ID_MISMATCH');
    }
    if (data.available_rooms > room.total_rooms) {
      throw new ApiError(
        `available_rooms cannot exceed the room inventory of ${room.total_rooms}`,
        400,
        'INVENTORY_EXCEEDED'
      );
    }

    const date = parseDateInput(data.date, 'date');
    const availability = await RoomAvailability.findOneAndUpdate(
      { room_id: room._id, date },
      {
        $set: {
          available_rooms: data.available_rooms,
          status: data.status ?? (data.available_rooms > 0 ? 'available' : 'unavailable'),
          ...(data.price_override !== undefined ? { price_override: data.price_override } : {}),
        },
        $setOnInsert: { room_id: room._id, date },
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({ success: true, availability });
  } catch (error) {
    next(error);
  }
};

/** Publish a whole date range in one request — the dashboard's main action. */
export const bulkUpsertRoomAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'room id');
    const data = parseOrThrow(bulkRoomAvailabilitySchema, req.body);
    const room = await loadOwnedRoom(req, id);

    if (data.room_id && data.room_id !== id) {
      throw new ApiError('room_id does not match the request path', 400, 'ROOM_ID_MISMATCH');
    }
    if (data.available_rooms > room.total_rooms) {
      throw new ApiError(
        `available_rooms cannot exceed the room inventory of ${room.total_rooms}`,
        400,
        'INVENTORY_EXCEEDED'
      );
    }

    const start = parseDateInput(data.start_date, 'start date');
    const end = parseDateInput(data.end_date, 'end date');
    const nights = eachNight(start, end);

    const status = data.status ?? (data.available_rooms > 0 ? 'available' : 'unavailable');
    const priceUpdate =
      data.price_override === null
        ? { $unset: { price_override: '' } }
        : data.price_override !== undefined
          ? { $set: { price_override: data.price_override } }
          : { $set: {} };

    // Bulk upsert keeps the composite (room_id, date) key authoritative even
    // when a provider republishes a range they already edited.
    const operations = nights.map((night) => ({
      updateOne: {
        filter: { room_id: room._id, date: night },
        update: {
          $set: { available_rooms: data.available_rooms, status, ...priceUpdate.$set },
          ...(priceUpdate.$unset ? { $unset: priceUpdate.$unset } : {}),
          $setOnInsert: { room_id: room._id, date: night },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await RoomAvailability.bulkWrite(operations);
    }

    res.json({ success: true, updated: operations.length });
  } catch (error) {
    next(error);
  }
};