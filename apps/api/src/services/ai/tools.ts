/**
 * The assistant's tool surface.
 *
 * Every tool is read-only. There is deliberately no booking tool that writes:
 * the only way a booking is created is the normal `POST /api/v1/bookings`
 * endpoint, after a human presses Confirm. That is the confirmation gate, and
 * keeping it outside the model's reach is what makes it enforceable.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import {
  findHotelByName,
  getHotelRooms,
  searchDestinations,
  searchHotels,
  searchPhotographers,
  searchVehicles,
} from './retrieval.service';

const searchDestinationsTool = tool({
  description: 'Search tourist destinations in Bangladesh by name. Use for questions about places to visit.',
  inputSchema: z.object({
    query: z.string().trim().describe('Destination name or part of it, for example Cox\'s Bazar'),
  }),
  execute: async ({ query }) => searchDestinations(query),
});

const searchHotelsTool = tool({
  description:
    'Search hotels, optionally filtered by destination, nightly price ceiling, and guest capacity. Prices are per room per night in BDT.',
  inputSchema: z.object({
    query: z.string().trim().optional().describe('Hotel name or address fragment'),
    destination: z.string().trim().optional().describe('Destination name, for example Sylhet'),
    max_price: z.number().positive().optional().describe('Maximum price per night in BDT'),
    guests: z.number().int().positive().optional().describe('Minimum guest capacity per room'),
  }),
  execute: async (input) => searchHotels(input),
});

const getHotelRoomsTool = tool({
  description: 'List rooms in one hotel with capacity and nightly price. Call this before proposing a booking.',
  inputSchema: z.object({
    hotel_id: z.string().trim().describe('Hotel id taken from a searchHotels result'),
  }),
  execute: async ({ hotel_id }) => getHotelRooms(hotel_id),
});

const searchPhotographersTool = tool({
  description: 'Find photographers, optionally filtered by destination. Use for photography questions.',
  inputSchema: z.object({
    destination: z.string().trim().optional().describe('Destination name'),
  }),
  execute: async (input) => searchPhotographers(input),
});

const searchVehiclesTool = tool({
  description: 'Find vehicles for hire, optionally filtered by price per day and seating capacity.',
  inputSchema: z.object({
    query: z.string().trim().optional().describe('Vehicle name or type, for example microbus'),
    max_price: z.number().positive().optional().describe('Maximum price per day in BDT'),
    guests: z.number().int().positive().optional().describe('Minimum seating capacity'),
  }),
  execute: async (input) => searchVehicles(input),
});

export interface PreparedDraft {
  hotel_id: string;
  room_id: string;
  hotel_name: string;
  room_type: string;
  check_in: string;
  check_out: string;
  rooms: number;
  guests: number;
}

/**
 * The model calls this to *propose* a booking. The tool validates the request
 * against real data and returns the confirmed ids, but it writes nothing. Its
 * result is turned into a draft card the visitor has to confirm.
 */
const prepareBookingDraftTool = tool({
  description:
    'Prepare a hotel booking draft for the visitor to confirm. This does not create a booking. Call it only once you know the hotel, check-in date, check-out date, and guest count.',
  inputSchema: z.object({
    hotel_name: z.string().trim().describe('Hotel name exactly as returned by searchHotels'),
    room_id: z.string().trim().describe('Room id from getHotelRooms'),
    check_in: z.string().trim().describe('Check-in date as YYYY-MM-DD, in the future'),
    check_out: z.string().trim().describe('Check-out date as YYYY-MM-DD, after check-in'),
    rooms: z.number().int().positive().max(20).describe('Number of rooms'),
    guests: z.number().int().positive().describe('Total number of guests'),
  }),
  execute: async (input): Promise<PreparedDraft | { error: string }> => {
    // `findHotelByName` grounds the model's hotel name onto a real document so
    // a hallucinated name cannot reach the booking form.
    const hotel = await findHotelByName(input.hotel_name);
    if (!hotel) {
      return { error: `No hotel named "${input.hotel_name}" exists. Search again and use an exact name.` };
    }

    const rooms = await getHotelRooms(hotel.id, 50);
    const room = rooms.find((candidate) => candidate.id === input.room_id);
    if (!room) {
      return { error: `Room ${input.room_id} does not belong to ${hotel.name}. Call getHotelRooms first.` };
    }

    return {
      hotel_id: hotel.id,
      room_id: room.id,
      hotel_name: hotel.name,
      room_type: room.room_type,
      check_in: input.check_in,
      check_out: input.check_out,
      rooms: input.rooms,
      guests: input.guests,
    };
  },
});

export const chatTools: ToolSet = {
  searchDestinations: searchDestinationsTool,
  searchHotels: searchHotelsTool,
  getHotelRooms: getHotelRoomsTool,
  searchPhotographers: searchPhotographersTool,
  searchVehicles: searchVehiclesTool,
  prepareBookingDraft: prepareBookingDraftTool,
};


