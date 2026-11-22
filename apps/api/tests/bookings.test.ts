import request from 'supertest';
import app from '../src/server';
import Booking from '../src/models/Booking';
import RoomAvailability from '../src/models/RoomAvailability';
import { BookingStatus, UserRole } from '@gtour/shared-types';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/db';
import { dateOffset, seedHotelWithRoom, tokenFor } from './helpers/fixtures';

const OWNER = '64b000000000000000000001';
const OTHER_OWNER = '64b000000000000000000002';
const GUEST = '64b000000000000000000003';
const OTHER_GUEST = '64b000000000000000000004';

const CHECK_IN = dateOffset(20);
const CHECK_OUT = dateOffset(23);

type Seeded = Awaited<ReturnType<typeof seedHotelWithRoom>>;

function auth(userId: string, role: UserRole) {
  return `Bearer ${tokenFor(userId, role)}`;
}

/** Books a stay through the public API and returns the created booking. */
async function bookStay(
  seeded: Seeded,
  overrides: Record<string, unknown> = {},
  userId = GUEST
): Promise<request.Response> {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', auth(userId, UserRole.TOURIST))
    .send({
      booking_type: 'hotel',
      hotel_room_id: String(seeded.room._id),
      start_date: CHECK_IN,
      end_date: CHECK_OUT,
      guest_count: 2,
      ...overrides,
    });
}

describe('Module 2 — hotel booking engine', () => {
  beforeAll(async () => {
    await startTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe('POST /bookings', () => {
    it('requires authentication', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await request(app).post('/api/v1/bookings').send({
        booking_type: 'hotel',
        hotel_room_id: String(seeded.room._id),
        start_date: CHECK_IN,
        end_date: CHECK_OUT,
        guest_count: 2,
      });

      expect(response.status).toBe(401);
    });

    it('ignores a client-supplied user_id and bills the token owner', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await bookStay(seeded, { user_id: OTHER_GUEST });

      expect(response.status).toBe(201);
      expect(String(response.body.booking.user_id)).toBe(GUEST);
    });

    it('prices the stay on the server and stores a snapshot', async () => {
      const seeded = await seedHotelWithRoom({
        ownerId: OWNER,
        pricePerNight: 200,
        totalRooms: 3,
      });

      const response = await bookStay(seeded, { room_count: 2 });

      expect(response.status).toBe(201);
      // 3 nights x 2 rooms x 200
      expect(response.body.booking.total_amount).toBe(1200);
      expect(response.body.booking.price_snapshot).toMatchObject({
        nights: 3,
        rooms: 2,
        price_per_night: 200,
        total: 1200,
      });
      expect(response.body.booking.price_snapshot.nightly).toHaveLength(3);
      expect(response.body.booking.status).toBe(BookingStatus.PENDING);
      expect(String(response.body.booking.hotel_id)).toBe(String(seeded.hotel._id));
    });

    it('rejects a tampered total amount', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 200 });

      const response = await bookStay(seeded, { total_amount: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PRICE_MISMATCH');
      expect(response.body.error.details).toMatchObject({ expected: 600, received: 1 });
      expect(await Booking.countDocuments()).toBe(0);
    });

    it('books the number of rooms the client asked for, not one', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 100, totalRooms: 5 });

      const response = await bookStay(seeded, { room_count: 4 });

      expect(response.status).toBe(201);
      expect(response.body.booking.room_count).toBe(4);
      expect(response.body.booking.total_amount).toBe(1200);

      const rows = await RoomAvailability.find({ room_id: seeded.room._id });
      expect(rows.every((row) => row.available_rooms === 1)).toBe(true);
    });

    it('rejects a room count above the available inventory', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      const response = await bookStay(seeded, { room_count: 3 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('NO_AVAILABILITY');
    });

    it('rejects a non-positive room count', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      const response = await bookStay(seeded, { room_count: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts a client total that matches the server price', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 200 });

      const response = await bookStay(seeded, { total_amount: 600 });

      expect(response.status).toBe(201);
      expect(response.body.booking.total_amount).toBe(600);
    });

    it('holds the nights against inventory', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 3 });

      await bookStay(seeded, { room_count: 2 });

      const rows = await RoomAvailability.find({ room_id: seeded.room._id });
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.available_rooms === 1)).toBe(true);
    });

    it('refuses to double-book the last room', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 1 });

      const first = await bookStay(seeded);
      const second = await bookStay(seeded, {}, OTHER_GUEST);

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('NO_AVAILABILITY');
      expect(await Booking.countDocuments()).toBe(1);
    });

    it('rejects a stay longer than the maximum window', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await bookStay(seeded, { end_date: dateOffset(200) });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('STAY_TOO_LONG');
    });

    it('rejects a same-day stay', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await bookStay(seeded, { end_date: CHECK_IN });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_DATES');
    });

    it('rejects a stay in the past', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await bookStay(seeded, {
        start_date: dateOffset(-5),
        end_date: dateOffset(-2),
      });

      expect(response.status).toBe(400);
    });

    it('rejects more guests than the room capacity allows', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, capacity: 2, totalRooms: 5 });

      const response = await bookStay(seeded, { guest_count: 9 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CAPACITY_EXCEEDED');
    });

    it('rejects a booking with no room reference', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', auth(GUEST, UserRole.TOURIST))
        .send({
          booking_type: 'hotel',
          start_date: CHECK_IN,
          end_date: CHECK_OUT,
          guest_count: 2,
        });

      expect(response.status).toBe(400);
    });

    it('rejects a room that does not exist', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', auth(GUEST, UserRole.TOURIST))
        .send({
          booking_type: 'hotel',
          hotel_room_id: '64b0000000000000000000ff',
          start_date: CHECK_IN,
          end_date: CHECK_OUT,
          guest_count: 2,
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
    });
  });

  describe('booking visibility', () => {
    it('returns the caller own bookings only', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      await bookStay(seeded);
      await seedHotelWithRoom({ ownerId: OTHER_OWNER });

      const response = await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', auth(GUEST, UserRole.TOURIST));

      expect(response.status).toBe(200);
      expect(response.body.bookings).toHaveLength(1);
    });

    it('scopes the provider queue to hotels the caller owns', async () => {
      const mine = await seedHotelWithRoom({ ownerId: OWNER });
      const theirs = await seedHotelWithRoom({ ownerId: OTHER_OWNER });

      await bookStay(mine);
      await bookStay(theirs, {}, OTHER_GUEST);

      const response = await request(app)
        .get('/api/v1/bookings/provider')
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER));

      expect(response.status).toBe(200);
      expect(response.body.bookings).toHaveLength(1);
      expect(String(response.body.bookings[0].hotel_id._id)).toBe(String(mine.hotel._id));
    });

    it('rejects a tourist reading the provider queue', async () => {
      const response = await request(app)
        .get('/api/v1/bookings/provider')
        .set('Authorization', auth(GUEST, UserRole.TOURIST));

      expect(response.status).toBe(403);
    });

    it('returns an empty queue for an owner with no hotels', async () => {
      const response = await request(app)
        .get('/api/v1/bookings/provider')
        .set('Authorization', auth(OTHER_OWNER, UserRole.HOTEL_OWNER));

      expect(response.status).toBe(200);
      expect(response.body.bookings).toEqual([]);
    });

    it('hides another guest booking by id', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);

      const response = await request(app)
        .get(`/api/v1/bookings/${created.body.booking._id}`)
        .set('Authorization', auth(OTHER_GUEST, UserRole.TOURIST));

      expect(response.status).toBe(403);
    });

    it('lets the owning provider read a booking', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);

      const response = await request(app)
        .get(`/api/v1/bookings/${created.body.booking._id}`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER));

      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /bookings/:id/status', () => {
    it('blocks a guest from confirming their own booking', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded, {}, GUEST);
      const bookingId = created.body.booking._id;

      const response = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(GUEST, UserRole.TOURIST))
        .send({ status: BookingStatus.CONFIRMED });

      expect(response.status).toBe(403);
    });

    it('lets the provider confirm through the pending workflow', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);
      const bookingId = created.body.booking._id;

      const confirm = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CONFIRMED });

      expect(confirm.status).toBe(200);
      expect(confirm.body.booking.status).toBe(BookingStatus.CONFIRMED);

      const complete = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.COMPLETED });

      expect(complete.status).toBe(200);
      expect(complete.body.booking.status).toBe(BookingStatus.COMPLETED);
    });

    it('rejects skipping straight to completed', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);

      const response = await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.COMPLETED });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(response.body.error.details.allowed).toEqual(
        expect.arrayContaining([BookingStatus.CONFIRMED, BookingStatus.CANCELLED])
      );
    });

    it('rejects a status update from an unrelated owner', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);

      const response = await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OTHER_OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CONFIRMED });

      expect(response.status).toBe(403);
    });

    it('lets a guest cancel and hands the nights back', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 1 });
      const created = await bookStay(seeded, {}, GUEST);
      const bookingId = created.body.booking._id;

      const response = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(GUEST, UserRole.TOURIST))
        .send({ status: BookingStatus.CANCELLED, reason: 'Change of plans' });

      expect(response.status).toBe(200);
      expect(response.body.booking.status).toBe(BookingStatus.CANCELLED);
      expect(response.body.booking.cancellation_reason).toBe('Change of plans');
      expect(response.body.booking.cancelled_at).toBeTruthy();

      const rows = await RoomAvailability.find({ room_id: seeded.room._id });
      expect(rows.every((row) => row.available_rooms === 1)).toBe(true);
      expect(rows.every((row) => row.status === 'available')).toBe(true);
    });

    it('frees inventory so the cancelled nights can be rebooked', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 1 });
      const created = await bookStay(seeded);

      await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CANCELLED });

      const rebook = await bookStay(seeded, {}, OTHER_GUEST);
      expect(rebook.status).toBe(201);
    });

    it('releases inventory for a no-show', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });
      const created = await bookStay(seeded);

      await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CONFIRMED });

      const response = await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.NO_SHOW });

      expect(response.status).toBe(200);

      const rows = await RoomAvailability.find({ room_id: seeded.room._id });
      expect(rows.every((row) => row.available_rooms === 2)).toBe(true);
    });

    it('keeps inventory held when a booking is merely confirmed', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });
      const created = await bookStay(seeded);

      await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CONFIRMED });

      const rows = await RoomAvailability.find({ room_id: seeded.room._id });
      expect(rows.every((row) => row.available_rooms === 1)).toBe(true);
    });

    it('will not resurrect a cancelled booking', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);
      const bookingId = created.body.booking._id;

      await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CANCELLED });

      const response = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: BookingStatus.CONFIRMED });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects a booking type of photography for now', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', auth(GUEST, UserRole.TOURIST))
        .send({
          booking_type: 'photography',
          photography_service_id: '64b0000000000000000000aa',
          start_date: CHECK_IN,
          end_date: CHECK_OUT,
          guest_count: 1,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('UNSUPPORTED_BOOKING_TYPE');
    });

    it('rejects an unknown status value', async () => {
      const seeded = await seedHotelWithRoom({ ownerId: OWNER });
      const created = await bookStay(seeded);

      const response = await request(app)
        .patch(`/api/v1/bookings/${created.body.booking._id}/status`)
        .set('Authorization', auth(OWNER, UserRole.HOTEL_OWNER))
        .send({ status: 'refunded' });

      expect(response.status).toBe(400);
    });
  });
});