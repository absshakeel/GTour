/**
 * Read-only retrieval for the tourism assistant.
 *
 * These functions are the assistant's only window into the platform. They
 * contain no writes: an assistant answer can never create, update, or delete a
 * document. Every row returned here is later treated as untrusted data, because
 * a listing description is free text that an owner could fill with instructions
 * aimed at the model.
 */
import mongoose from 'mongoose';
import Destination from '../../models/Destination';
import Hotel from '../../models/Hotel';
import Room from '../../models/Room';
import Photographer from '../../models/Photographer';
import Vehicle from '../../models/Vehicle';
// Imported for their side effect: `populate()` resolves a ref by asking the
// mongoose registry for the model name, so a schema that is never imported
// here throws `MissingSchemaError` at query time even though the collection
// exists. Both are only used through `populate` below.
import '../../models/Category';
import '../../models/Location';
import '../../models/VehicleProvider';
import { aiConfig } from './config';

/** Fields the assistant is allowed to see. Owner accounts and contacts are excluded. */
const HOTEL_FIELDS = 'name description address images rating destination_id';

export interface DestinationHit {
  id: string;
  name: string;
  description: string;
  estimated_budget: number | null;
  best_visit_season: string | null;
  average_rating: number | null;
  category: string | null;
  location: string | null;
}

export interface HotelHit {
  id: string;
  name: string;
  description: string;
  address: string;
  rating: number | null;
  destination: string | null;
  price_from: number | null;
  price_to: number | null;
}

export interface RoomHit {
  id: string;
  hotel_id: string;
  hotel_name: string;
  room_type: string;
  bed_type: string;
  capacity: number;
  price_per_night: number;
  amenities: string[];
}

export interface PhotographerHit {
  id: string;
  name: string;
  bio: string | null;
  rating: number | null;
  destination: string | null;
}

export interface VehicleHit {
  id: string;
  name: string;
  type: string;
  capacity: number;
  price_per_day: number;
  features: string[];
  provider: string | null;
}

/** Free-text search input is escaped so a stray `(` cannot break the regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive partial match used for names that the model spells loosely. */
function looseMatch(value: string): RegExp {
  return new RegExp(escapeRegex(value.trim()), 'i');
}

/**
 * Prices are stored per room, so the hotel's range comes from an aggregate
 * rather than from the hotel document.
 */
async function priceRangesFor(
  hotelIds: mongoose.Types.ObjectId[],
): Promise<Map<string, { min: number; max: number }>> {
  if (hotelIds.length === 0) return new Map();

  const rows = await Room.aggregate<{ _id: mongoose.Types.ObjectId; min: number; max: number }>([
    { $match: { hotel_id: { $in: hotelIds } } },
    { $group: { _id: '$hotel_id', min: { $min: '$price_per_night' }, max: { $max: '$price_per_night' } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), { min: row.min, max: row.max }]));
}

export async function searchDestinations(query: string, limit = aiConfig.maxToolRows) {
  const filter: Record<string, unknown> = { archived_at: null };
  if (query.trim()) filter.name = looseMatch(query);

  const docs = await Destination.find(filter)
    .select('name description estimated_budget best_visit_season average_rating category_id location_id')
    .populate('category_id', 'name')
    .populate('location_id', 'name country region')
    .sort({ average_rating: -1, _id: -1 })
    .limit(limit)
    .lean();

  return docs.map((doc): DestinationHit => {
    const category = doc.category_id as unknown as { name?: string } | null;
    const location = doc.location_id as unknown as { name?: string; country?: string } | null;

    return {
      id: String(doc._id),
      name: doc.name,
      description: doc.description,
      estimated_budget: doc.estimated_budget ?? null,
      best_visit_season: doc.best_visit_season ?? null,
      average_rating: doc.average_rating ?? null,
      category: category?.name ?? null,
      location: location?.name ?? null,
    };
  });
}

/** Resolves a destination by name so hotels can be found from a place question. */
async function destinationIdByName(name: string): Promise<mongoose.Types.ObjectId | null> {
  const match = await Destination.findOne({ name: looseMatch(name), archived_at: null })
    .select('_id')
    .lean();
  return match?._id ?? null;
}

export async function searchHotels(
  options: { query?: string; destination?: string; max_price?: number; guests?: number },
  limit = aiConfig.maxToolRows,
) {
  const filter: Record<string, unknown> = {};

  if (options.query?.trim()) {
    filter.$or = [ { name: looseMatch(options.query) }, { address: looseMatch(options.query) } ];
  }

  if (options.destination?.trim()) {
    const destinationId = await destinationIdByName(options.destination);
    // An unknown place must return no rows, not every hotel in the country.
    filter.destination_id = destinationId ?? new mongoose.Types.ObjectId();
  }

  if (options.max_price !== undefined || options.guests !== undefined) {
    const roomFilter: Record<string, unknown> = {};
    if (options.max_price !== undefined) roomFilter.price_per_night = { $lte: options.max_price };
    if (options.guests !== undefined) roomFilter.capacity = { $gte: options.guests };

    const hotelIds = await Room.distinct('hotel_id', roomFilter);
    filter._id = { $in: hotelIds };
  }

  const docs = await Hotel.find(filter)
    .select(HOTEL_FIELDS)
    .populate('destination_id', 'name')
    .sort({ rating: -1, _id: -1 })
    .limit(limit)
    .lean();

  const ranges = await priceRangesFor(docs.map((doc) => doc._id));

  return docs.map((doc): HotelHit => {
    const destination = doc.destination_id as unknown as { name?: string } | null;
    const range = ranges.get(String(doc._id));

    return {
      id: String(doc._id),
      name: doc.name,
      description: doc.description,
      address: doc.address,
      rating: doc.rating ?? null,
      destination: destination?.name ?? null,
      price_from: range?.min ?? null,
      price_to: range?.max ?? null,
    };
  });
}

export async function getHotelRooms(hotelId: string, limit = aiConfig.maxToolRows) {
  if (!mongoose.isValidObjectId(hotelId)) return [];

  const docs = await Room.find({ hotel_id: new mongoose.Types.ObjectId(hotelId) })
    .select('hotel_id room_type bed_type capacity price_per_night amenities')
    .populate('hotel_id', 'name')
    .sort({ price_per_night: 1 })
    .limit(limit)
    .lean();

  return docs.map((doc): RoomHit => {
    const hotel = doc.hotel_id as unknown as { _id: mongoose.Types.ObjectId; name?: string } | null;

    return {
      id: String(doc._id),
      hotel_id: hotel?._id ? String(hotel._id) : String(hotelId),
      hotel_name: hotel?.name ?? '',
      room_type: doc.room_type,
      bed_type: doc.bed_type,
      capacity: doc.capacity,
      price_per_night: doc.price_per_night,
      amenities: doc.amenities ?? [],
    };
  });
}

export async function searchPhotographers(
  options: { destination?: string; max_price?: number },
  limit = aiConfig.maxToolRows,
) {
  const filter: Record<string, unknown> = {};

  if (options.destination?.trim()) {
    const destinationId = await destinationIdByName(options.destination);
    filter.destination_id = destinationId ?? new mongoose.Types.ObjectId();
  }

  const docs = await Photographer.find(filter)
    .select('name bio rating destination_id')
    .populate('destination_id', 'name')
    .sort({ rating: -1, _id: -1 })
    .limit(limit)
    .lean();

  return docs.map((doc): PhotographerHit => {
    const destination = doc.destination_id as unknown as { name?: string } | null;
    return {
      id: String(doc._id),
      name: doc.name,
      bio: doc.bio ?? null,
      rating: doc.rating ?? null,
      destination: destination?.name ?? null,
    };
  });
}

export async function searchVehicles(
  options: { query?: string; max_price?: number; guests?: number },
  limit = aiConfig.maxToolRows,
) {
  const filter: Record<string, unknown> = {};

  if (options.query?.trim()) filter.$or = [{ name: looseMatch(options.query) }, { type: looseMatch(options.query) }];
  if (options.max_price !== undefined) filter.price_per_day = { $lte: options.max_price };
  if (options.guests !== undefined) filter.capacity = { $gte: options.guests };

  const docs = await Vehicle.find(filter)
    .select('name type capacity price_per_day features provider_id')
    .populate('provider_id', 'name')
    .sort({ price_per_day: 1, _id: -1 })
    .limit(limit)
    .lean();

  return docs.map((doc): VehicleHit => {
    const provider = doc.provider_id as unknown as { name?: string } | null;

    return {
      id: String(doc._id),
      name: doc.name,
      type: doc.type,
      capacity: doc.capacity,
      price_per_day: doc.price_per_day,
      features: doc.features ?? [],
      provider: provider?.name ?? null,
    };
  });
}

/**
 * Grounds a hotel name the model mentioned back onto a real hotel id.
 * Without this the model could invent an id and the draft would target nothing.
 */
export async function findHotelByName(name: string) {
  const match = await Hotel.findOne({ name: looseMatch(name) }).select('_id name').lean();
  return match ? { id: String(match._id), name: match.name } : null;
}
