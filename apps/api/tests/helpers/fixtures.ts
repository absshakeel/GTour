import jwt from 'jsonwebtoken';
import Hotel from '../../src/models/Hotel';
import Room from '../../src/models/Room';
import { UserRole } from '@gtour/shared-types';

export const TEST_JWT_SECRET = 'module-2-test-secret';

process.env.JWT_SECRET = TEST_JWT_SECRET;

export function tokenFor(userId: string, role: UserRole = UserRole.TOURIST): string {
  return jwt.sign({ userId, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

/** Creates a hotel owned by `ownerId`, with one room that has `totalRooms`. */
export async function seedHotelWithRoom(options: {
  ownerId: string;
  destinationId?: string;
  pricePerNight?: number;
  totalRooms?: number;
  capacity?: number;
}) {
  const hotel = await Hotel.create({
    name: 'Test Harbour Hotel',
    description: 'A test hotel used by the module 2 suite.',
    address: '1 Test Street, Aqaba',
    images: ['https://example.com/hotel.jpg'],
    destination_id: options.destinationId ?? '507f1f77bcf86cd799439011',
    owner_id: options.ownerId,
    rating: 4,
  });

  const room = await Room.create({
    hotel_id: hotel._id,
    room_type: 'Deluxe Sea View',
    bed_type: 'King',
    capacity: options.capacity ?? 2,
    price_per_night: options.pricePerNight ?? 100,
    total_rooms: options.totalRooms ?? 2,
    amenities: ['wifi', 'breakfast'],
    images: ['https://example.com/room.jpg'],
  });

  return { hotel, room };
}

/** UTC-midnight date `offsetDays` from today, as `YYYY-MM-DD`. */
export function dateOffset(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}