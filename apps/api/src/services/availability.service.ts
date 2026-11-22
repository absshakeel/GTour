import mongoose from 'mongoose';
import Room, { IRoom } from '../models/Room';
import RoomAvailability from '../models/RoomAvailability';
import { ApiError } from '../utils/ApiError';
import { eachNight, normaliseStayRange, startOfUtcDay } from '../utils/dates';
import { currencyCode } from '../config/currency';

export interface NightlyRate {
  date: string;
  available_rooms: number;
  price_per_night: number;
  status: 'available' | 'partial' | 'unavailable';
}

export interface StayQuote {
  currency: string;
  check_in: string;
  check_out: string;
  nights: number;
  rooms: number;
  nightly: NightlyRate[];
  price_per_night: number;
  subtotal: number;
  total: number;
  available: boolean;
  /**
   * Most rooms that could still be held for every night of this stay. Exposed so
   * the UI can cap its own room selector instead of offering a count the server
   * would reject with `NO_AVAILABILITY`.
   */
  max_rooms: number;
}

function statusFor(availableRooms: number, totalRooms: number): NightlyRate['status'] {
  if (availableRooms <= 0) return 'unavailable';
  if (availableRooms < totalRooms) return 'partial';
  return 'available';
}

/**
 * Nightly availability for a stay. A RoomAvailability document is an override
 * for that specific night; when one is missing the room's own inventory
 * (`total_rooms`) applies. This lets a provider publish exceptions without
 * materialising a row for every future date.
 */
export async function loadNightlyAvailability(
  room: IRoom,
  start: Date,
  end: Date
): Promise<NightlyRate[]> {
  const nights = eachNight(start, end);
  const overrides = await RoomAvailability.find({
    room_id: room._id,
    date: { $in: nights },
  });

  const byDate = new Map(overrides.map((entry) => [startOfUtcDay(entry.date).toISOString(), entry]));

  return nights.map((night) => {
    const key = night.toISOString();
    const override = byDate.get(key);

    const availableRooms = override
      ? override.status === 'unavailable'
        ? 0
        : override.available_rooms
      : room.total_rooms;

    const pricePerNight = override?.price_override ?? room.price_per_night;

    return {
      date: key.slice(0, 10),
      available_rooms: Math.max(0, availableRooms),
      price_per_night: pricePerNight,
      status: statusFor(availableRooms, room.total_rooms),
    };
  });
}

/**
 * Authoritative price for a stay. This is the only place a booking total is
 * computed — the client's own figure is never trusted.
 */
export async function quoteStay(
  room: IRoom,
  startValue: Date | string,
  endValue: Date | string,
  rooms = 1,
  guests = 1
): Promise<StayQuote> {
  const { start, end, nights } = normaliseStayRange(startValue, endValue);

  if (guests > room.capacity * rooms) {
    throw new ApiError(
      `This room sleeps ${room.capacity} guests; ${rooms} room(s) cannot host ${guests} guests`,
      400,
      'CAPACITY_EXCEEDED'
    );
  }

  const nightly = await loadNightlyAvailability(room, start, end);
  const available = nightly.every((night) => night.available_rooms >= rooms);
  const subtotal = nightly.reduce((sum, night) => sum + night.price_per_night * rooms, 0);

  // A stay is limited by its scarcest night, not by the first one.
  const maxRooms = nightly.reduce(
    (lowest, night) => Math.min(lowest, night.available_rooms),
    room.total_rooms
  );

  return {
    currency: currencyCode(),
    check_in: start.toISOString().slice(0, 10),
    check_out: end.toISOString().slice(0, 10),
    nights,
    rooms,
    nightly,
    price_per_night: nightly[0]?.price_per_night ?? room.price_per_night,
    subtotal,
    total: subtotal,
    available,
    max_rooms: maxRooms,
  };
}

/** Restores status flags after inventory changes. */
async function syncStatuses(
  room: IRoom,
  nights: Date[],
  session?: mongoose.ClientSession
): Promise<void> {
  await RoomAvailability.updateMany(
    { room_id: room._id, date: { $in: nights.map((night) => startOfUtcDay(night)) } },
    [
      {
        $set: {
          status: {
            $cond: [
              { $lte: ['$available_rooms', 0] },
              'unavailable',
              {
                $cond: [{ $gte: ['$available_rooms', room.total_rooms] }, 'available', 'partial'],
              },
            ],
          },
        },
      },
    ],
    { session }
  );
}

/**
 * Atomically holds `rooms` units for every night of the stay.
 *
 * Each night is a conditional `$inc` guarded by `available_rooms >= rooms`, so
 * two concurrent requests for the last room cannot both succeed. If any night
 * fails, every night already decremented in this call is compensated, leaving
 * availability exactly as it was.
 */
export async function reserveNights(
  room: IRoom,
  start: Date,
  end: Date,
  rooms: number,
  session?: mongoose.ClientSession
): Promise<void> {
  const nights = eachNight(start, end);
  const reserved: Date[] = [];

  try {
    for (const night of nights) {
      // Materialise the override row from inventory when it does not exist yet.
      await RoomAvailability.updateOne(
        { room_id: room._id, date: night },
        {
          $setOnInsert: {
            room_id: room._id,
            date: night,
            available_rooms: room.total_rooms,
            status: 'available',
          },
        },
        { upsert: true, session }
      );

      const updated = await RoomAvailability.findOneAndUpdate(
        {
          room_id: room._id,
          date: night,
          status: { $ne: 'unavailable' },
          available_rooms: { $gte: rooms },
        },
        { $inc: { available_rooms: -rooms } },
        { new: true, session }
      );

      if (!updated) {
        throw new ApiError(
          `No availability for ${night.toISOString().slice(0, 10)}`,
          409,
          'NO_AVAILABILITY',
          { date: night.toISOString().slice(0, 10) }
        );
      }

      reserved.push(night);
    }

    await syncStatuses(room, nights, session);
  } catch (error) {
    await releaseNights(room, reserved, rooms, session);
    throw error;
  }
}

/** Returns held units to inventory. Safe to call for a partial night list. */
export async function releaseNights(
  room: IRoom,
  nights: Date[],
  rooms: number,
  session?: mongoose.ClientSession
): Promise<void> {
  if (nights.length === 0) return;

  for (const night of nights) {
    await RoomAvailability.updateOne(
      { room_id: room._id, date: startOfUtcDay(night) },
      { $inc: { available_rooms: rooms } },
      { session }
    );
  }

  await syncStatuses(room, nights, session);
}