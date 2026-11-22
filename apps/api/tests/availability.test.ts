import mongoose from 'mongoose';
import { ApiError } from '../src/utils/ApiError';
import { eachNight, normaliseStayRange, startOfUtcDay } from '../src/utils/dates';
import {
  loadNightlyAvailability,
  quoteStay,
  releaseNights,
  reserveNights,
} from '../src/services/availability.service';
import Room from '../src/models/Room';
import RoomAvailability from '../src/models/RoomAvailability';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/db';
import { dateOffset, seedHotelWithRoom } from './helpers/fixtures';

const OWNER = '64b000000000000000000001';
const CHECK_IN = dateOffset(10);
const CHECK_OUT = dateOffset(13);

function nightKeys(from: string, to: string): string[] {
  return eachNight(startOfUtcDay(from), startOfUtcDay(to)).map((night) =>
    night.toISOString().slice(0, 10)
  );
}

/** Asserts the rejected promise carries the expected ApiError code/status. */
async function expectApiError(
  promise: Promise<unknown>,
  code: string,
  statusCode: number
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code, statusCode });
}

describe('availability and pricing service', () => {
  beforeAll(async () => {
    await startTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe('date helpers', () => {
    it('counts nights with an exclusive end date', () => {
      expect(normaliseStayRange(CHECK_IN, CHECK_OUT).nights).toBe(3);
    });

    it('rejects a zero-night stay', () => {
      expect(() => normaliseStayRange(CHECK_IN, CHECK_IN)).toThrow(ApiError);
      expect(() => normaliseStayRange(CHECK_IN, CHECK_IN)).toThrow('End date must be after');
    });

    it('rejects an inverted range', () => {
      expect(() => normaliseStayRange(CHECK_OUT, CHECK_IN)).toThrow('End date must be after');
    });

    it('rejects a stay beyond the maximum length', () => {
      expect(() => normaliseStayRange(CHECK_IN, dateOffset(200))).toThrow('cannot exceed 60 nights');
    });

    it('normalises any timestamp to UTC midnight', () => {
      expect(startOfUtcDay('2026-03-05T21:45:12.000Z').toISOString()).toBe(
        '2026-03-05T00:00:00.000Z'
      );
    });
  });

  describe('quoteStay', () => {
    it('prices every night from the room rate', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 120 });
      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT);

      expect(quote.nights).toBe(3);
      expect(quote.subtotal).toBe(360);
      expect(quote.total).toBe(360);
      expect(quote.available).toBe(true);
      expect(quote.nightly).toHaveLength(3);
    });

    it('multiplies by the number of rooms', async () => {
      const { room } = await seedHotelWithRoom({
        ownerId: OWNER,
        pricePerNight: 100,
        totalRooms: 4,
      });

      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT, 3, 6);
      expect(quote.total).toBe(900);
    });

    it('uses the per-night override instead of the base rate', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 100 });

      await RoomAvailability.create({
        room_id: room._id,
        date: startOfUtcDay(dateOffset(11)),
        available_rooms: 2,
        price_override: 250,
      });

      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT);
      // 100 + 250 + 100
      expect(quote.total).toBe(450);
      expect(quote.nightly.find((night) => night.date === dateOffset(11))?.price_per_night).toBe(250);
    });

    it('rejects more guests than the room capacity allows', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, capacity: 2 });
      await expectApiError(
        quoteStay(room, CHECK_IN, CHECK_OUT, 1, 5),
        'CAPACITY_EXCEEDED',
        400
      );
    });

    it('marks the stay unavailable when a night has no inventory', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });
      await RoomAvailability.create({
        room_id: room._id,
        date: startOfUtcDay(dateOffset(11)),
        available_rooms: 0,
        status: 'unavailable',
      });

      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT);
      expect(quote.available).toBe(false);
      expect(
        quote.nightly.find((night) => night.date === dateOffset(11))?.available_rooms
      ).toBe(0);
    });

    it('reports the scarcest night as the room ceiling', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 5 });
      await RoomAvailability.create({
        room_id: room._id,
        date: startOfUtcDay(dateOffset(12)),
        available_rooms: 2,
        status: 'partial',
      });

      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT);

      // Nights with no override report the room's full inventory, so the middle
      // night is what limits the stay.
      expect(quote.max_rooms).toBe(2);
      expect(quote.available).toBe(true);
    });

    it('reports full inventory as the ceiling when nothing is held', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 4 });

      const quote = await quoteStay(room, CHECK_IN, CHECK_OUT);

      expect(quote.max_rooms).toBe(4);
    });
  });

  describe('loadNightlyAvailability', () => {
    it('falls back to room inventory when no override exists', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 5 });
      const nights = await loadNightlyAvailability(
        room,
        startOfUtcDay(CHECK_IN),
        startOfUtcDay(CHECK_OUT)
      );

      expect(nights).toHaveLength(3);
      expect(nights.every((night) => night.available_rooms === 5)).toBe(true);
      expect(nights.every((night) => night.status === 'available')).toBe(true);
    });

    it('flags a partial night when some inventory is already held', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 4 });
      await RoomAvailability.create({
        room_id: room._id,
        date: startOfUtcDay(dateOffset(11)),
        available_rooms: 1,
      });

      const nights = await loadNightlyAvailability(
        room,
        startOfUtcDay(CHECK_IN),
        startOfUtcDay(CHECK_OUT)
      );
      expect(nights.find((night) => night.date === dateOffset(11))?.status).toBe('partial');
    });
  });

  describe('reserveNights', () => {
    it('decrements every night and records the remaining inventory', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 3 });

      await reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 2);

      const rows = await RoomAvailability.find({ room_id: room._id });
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.available_rooms === 1)).toBe(true);
      expect(rows.every((row) => row.status === 'partial')).toBe(true);
    });

    it('refuses to oversell the last room', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 1 });

      await reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 1);

      await expectApiError(
        reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 1),
        'NO_AVAILABILITY',
        409
      );

      const rows = await RoomAvailability.find({ room_id: room._id });
      expect(rows.every((row) => row.available_rooms === 0)).toBe(true);
    });

    it('rolls back nights already taken when a later night fails', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      // Block only the final night of the stay.
      await RoomAvailability.create({
        room_id: room._id,
        date: startOfUtcDay(dateOffset(12)),
        available_rooms: 0,
        status: 'unavailable',
      });

      await expectApiError(
        reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 1),
        'NO_AVAILABILITY',
        409
      );

      const rows = await RoomAvailability.find({ room_id: room._id }).sort({ date: 1 });
      const byDate = new Map(
        rows.map((row) => [row.date.toISOString().slice(0, 10), row.available_rooms])
      );

      // The two nights taken before the failure were compensated.
      expect(byDate.get(dateOffset(10))).toBe(2);
      expect(byDate.get(dateOffset(11))).toBe(2);
      expect(byDate.get(dateOffset(12))).toBe(0);
    });

    it('serves only one of two concurrent requests for the last room', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 1 });

      const results = await Promise.allSettled([
        reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 1),
        reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 1),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'NO_AVAILABILITY',
        statusCode: 409,
      });

      const rows = await RoomAvailability.find({ room_id: room._id });
      expect(rows.every((row) => row.available_rooms === 0)).toBe(true);
    });
  });

  describe('releaseNights', () => {
    it('restores inventory and the availability status', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });
      const nights = eachNight(startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT));

      await reserveNights(room, startOfUtcDay(CHECK_IN), startOfUtcDay(CHECK_OUT), 2);
      await releaseNights(room, nights, 2);

      const rows = await RoomAvailability.find({ room_id: room._id });
      expect(rows.every((row) => row.available_rooms === 2)).toBe(true);
      expect(rows.every((row) => row.status === 'available')).toBe(true);
    });

    it('is a no-op for an empty night list', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER });
      await expect(releaseNights(room, [], 1)).resolves.toBeUndefined();
      expect(await RoomAvailability.countDocuments({ room_id: room._id })).toBe(0);
    });
  });

  describe('availability key integrity', () => {
    it('rejects a duplicate night for the same room', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });
      const night = new Date(`${dateOffset(11)}T00:00:00.000Z`);

      await RoomAvailability.create({ room_id: room._id, date: night, available_rooms: 2 });

      // A second write for the same calendar night must not create a second row —
      // the composite unique key is what the atomic reservation relies on.
      await expect(
        RoomAvailability.create({ room_id: room._id, date: night, available_rooms: 1 })
      ).rejects.toThrow(/duplicate key/i);

      expect(await RoomAvailability.countDocuments({ room_id: room._id })).toBe(1);
    });

    it('stores nights at UTC midnight regardless of the input time', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER });
      const row = await RoomAvailability.create({
        room_id: room._id,
        date: new Date(`${dateOffset(5)}T23:59:59.000Z`),
        available_rooms: 1,
      });

      expect(row.date.toISOString()).toBe(`${dateOffset(5)}T00:00:00.000Z`);
      expect(nightKeys(CHECK_IN, CHECK_OUT)).toEqual([
        dateOffset(10),
        dateOffset(11),
        dateOffset(12),
      ]);
    });
  });
});