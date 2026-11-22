import request from 'supertest';
import app from '../src/server';
import Room from '../src/models/Room';
import RoomAvailability from '../src/models/RoomAvailability';
import { UserRole } from '@gtour/shared-types';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/db';
import { dateOffset, seedHotelWithRoom, tokenFor } from './helpers/fixtures';

const OWNER = '64b000000000000000000001';
const OTHER_OWNER = '64b000000000000000000002';
const GUEST = '64b000000000000000000003';

describe('Module 2 — hotels, rooms and availability', () => {
  beforeAll(async () => {
    await startTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe('hotel provider authorization', () => {
    it('requires authentication to create a hotel', async () => {
      const response = await request(app).post('/api/v1/hotels').send({
        name: 'No Auth Hotel',
        description: 'Should never be created without a token.',
        address: '1 Test Street',
        images: ['https://example.com/a.jpg'],
        destination_id: '507f1f77bcf86cd799439011',
      });

      expect(response.status).toBe(401);
    });

    it('rejects a tourist creating a hotel', async () => {
      const response = await request(app)
        .post('/api/v1/hotels')
        .set('Authorization', `Bearer ${tokenFor(GUEST, UserRole.TOURIST)}`)
        .send({
          name: 'Tourist Hotel',
          description: 'A tourist must not be able to create a hotel.',
          address: '1 Test Street',
          images: ['https://example.com/a.jpg'],
          destination_id: '507f1f77bcf86cd799439011',
        });

      expect(response.status).toBe(403);
    });

    it('derives owner_id from the token, not the body', async () => {
      const response = await request(app)
        .post('/api/v1/hotels')
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({
          name: 'Harbour Hotel',
          description: 'A hotel created by an authorized owner.',
          address: '1 Test Street, Aqaba',
          images: ['https://example.com/a.jpg'],
          destination_id: '507f1f77bcf86cd799439011',
          owner_id: OTHER_OWNER,
        });

      expect(response.status).toBe(201);
      expect(response.body.hotel.owner_id).toBe(OWNER);
    });

    it('blocks an owner from updating another owner hotel', async () => {
      const { hotel } = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await request(app)
        .put(`/api/v1/hotels/${hotel._id}`)
        .set('Authorization', `Bearer ${tokenFor(OTHER_OWNER, UserRole.HOTEL_OWNER)}`)
        .send({ name: 'Hijacked Hotel' });

      expect(response.status).toBe(403);
    });

    it('lets an owner update their own hotel', async () => {
      const { hotel } = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await request(app)
        .put(`/api/v1/hotels/${hotel._id}`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({ name: 'Renamed Hotel' });

      expect(response.status).toBe(200);
      expect(response.body.hotel.name).toBe('Renamed Hotel');
    });

    it('returns only the caller hotels from /mine', async () => {
      await seedHotelWithRoom({ ownerId: OWNER });
      await seedHotelWithRoom({ ownerId: OTHER_OWNER });

      const response = await request(app)
        .get('/api/v1/hotels/mine')
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`);

      expect(response.status).toBe(200);
      expect(response.body.hotels).toHaveLength(1);
      expect(response.body.hotels[0].owner_id).toBe(OWNER);
    });
  });

  describe('hotel discovery', () => {
    it('returns derived price bounds for each hotel', async () => {
      await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 150 });

      const response = await request(app).get('/api/v1/hotels');

      expect(response.status).toBe(200);
      expect(response.body.hotels[0].price_from).toBe(150);
      expect(response.body.hotels[0].price_to).toBe(150);
      expect(response.body.pagination.total).toBe(1);
    });

    it('filters hotels by room price instead of a non-existent hotel field', async () => {
      await seedHotelWithRoom({ ownerId: OWNER, pricePerNight: 80 });
      await seedHotelWithRoom({ ownerId: OTHER_OWNER, pricePerNight: 400 });

      const response = await request(app).get('/api/v1/hotels/search?min_price=300');

      expect(response.status).toBe(200);
      expect(response.body.hotels).toHaveLength(1);
      expect(response.body.hotels[0].price_from).toBe(400);
    });

    it('rejects an invalid destination id', async () => {
      const response = await request(app).get('/api/v1/hotels?destination_id=not-an-id');
      expect(response.status).toBe(400);
    });

    it('rejects a half-specified stay window instead of ignoring it', async () => {
      await seedHotelWithRoom({ ownerId: OWNER });

      const response = await request(app).get(`/api/v1/hotels/search?check_in=${dateOffset(1)}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_DATES');
    });

    it('rejects an inverted stay window', async () => {
      const response = await request(app).get(
        `/api/v1/hotels/search?check_in=${dateOffset(5)}&check_out=${dateOffset(2)}`
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_DATES');
    });

    it('excludes a hotel whose only room is sold out across the stay', async () => {
      const { hotel } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      // Selling the whole inventory for one night in the middle of the stay is
      // enough to make the hotel unbookable for the range.
      await RoomAvailability.create({
        room_id: (await Room.findOne({ hotel_id: hotel._id }))!._id,
        date: new Date(`${dateOffset(2)}T00:00:00.000Z`),
        available_rooms: 0,
        status: 'unavailable',
      });

      const window = `check_in=${dateOffset(1)}&check_out=${dateOffset(4)}`;
      const blocked = await request(app).get(`/api/v1/hotels/search?${window}`);

      expect(blocked.status).toBe(200);
      expect(blocked.body.hotels).toHaveLength(0);

      // The same hotel is still listed for a window that avoids the sold-out night.
      const open = await request(app).get(
        `/api/v1/hotels/search?check_in=${dateOffset(4)}&check_out=${dateOffset(6)}`
      );

      expect(open.body.hotels).toHaveLength(1);
    });

    it('keeps a hotel listed when only part of its inventory is taken', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 3 });

      await RoomAvailability.create({
        room_id: room._id,
        date: new Date(`${dateOffset(1)}T00:00:00.000Z`),
        available_rooms: 1,
        status: 'partial',
      });

      const response = await request(app).get(
        `/api/v1/hotels/search?check_in=${dateOffset(1)}&check_out=${dateOffset(3)}`
      );

      expect(response.status).toBe(200);
      expect(response.body.hotels).toHaveLength(1);
    });
  });

  describe('room availability', () => {
    it('returns a continuous calendar even with no stored overrides', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 3 });

      const response = await request(app).get(
        `/api/v1/rooms/${room._id}/availability?from=${dateOffset(1)}&to=${dateOffset(4)}`
      );

      expect(response.status).toBe(200);
      expect(response.body.nights).toHaveLength(3);
      expect(response.body.nights[0]).toMatchObject({
        date: dateOffset(1),
        available_rooms: 3,
        status: 'available',
      });
    });

    it('blocks a non-owner from publishing availability', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER });

      const response = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability`)
        .set('Authorization', `Bearer ${tokenFor(OTHER_OWNER, UserRole.HOTEL_OWNER)}`)
        .send({ room_id: String(room._id), date: dateOffset(1), available_rooms: 0 });

      expect(response.status).toBe(403);
    });

    it('rejects availability above the room inventory', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      const response = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({ room_id: String(room._id), date: dateOffset(1), available_rooms: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVENTORY_EXCEEDED');
    });

    it('publishes a whole range and applies the price override', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      const bulk = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability/bulk`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({
          room_id: String(room._id),
          start_date: dateOffset(1),
          end_date: dateOffset(4),
          available_rooms: 1,
          price_override: 250,
        });

      expect(bulk.status).toBe(200);
      expect(bulk.body.updated).toBe(3);

      const quote = await request(app).get(
        `/api/v1/rooms/${room._id}/quote?check_in=${dateOffset(1)}&check_out=${dateOffset(4)}`
      );

      expect(quote.status).toBe(200);
      expect(quote.body.quote.total).toBe(750);
      expect(quote.body.quote.nights).toBe(3);
    });

    /**
     * The dashboard posts to `/rooms/:id/availability/bulk` and relies on the
     * path to identify the room, so the body copy must stay optional — a
     * payload without `room_id` previously failed validation.
     */
    it('publishes a range when the body omits the room id', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 4 });

      const response = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability/bulk`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({
          start_date: dateOffset(1),
          end_date: dateOffset(3),
          available_rooms: 2,
          status: 'partial',
        });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(2);

      const calendar = await request(app).get(
        `/api/v1/rooms/${room._id}/availability?from=${dateOffset(1)}&to=${dateOffset(3)}`
      );

      expect(calendar.body.nights).toHaveLength(2);
      expect(calendar.body.nights.every((night: { available_rooms: number }) => night.available_rooms === 2)).toBe(
        true
      );
    });

    it('still rejects a body room id that contradicts the path', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 4 });

      const response = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability/bulk`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({
          room_id: '64b0000000000000000000ff',
          start_date: dateOffset(1),
          end_date: dateOffset(3),
          available_rooms: 1,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('ROOM_ID_MISMATCH');
    });

    it('rejects an inverted range with a validation error', async () => {
      const { room } = await seedHotelWithRoom({ ownerId: OWNER, totalRooms: 2 });

      const response = await request(app)
        .post(`/api/v1/rooms/${room._id}/availability/bulk`)
        .set('Authorization', `Bearer ${tokenFor(OWNER, UserRole.HOTEL_OWNER)}`)
        .send({
          start_date: dateOffset(5),
          end_date: dateOffset(2),
          available_rooms: 1,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});