import { Request, Response, NextFunction } from 'express';
import Vehicle from '../models/Vehicle';
import VehicleAvailability from '../models/VehicleAvailability';
import {
  bulkVehicleAvailabilitySchema,
  createVehicleSchema,
  createVehicleAvailabilitySchema,
  updateVehicleSchema,
  vehicleQuoteSchema,
} from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { eachNight, parseDateInput, startOfUtcDay } from '../utils/dates';
import { quoteRental, upcomingVehicleAvailability } from '../services/vehicleAvailability.service';
import { providerForUser } from './vehicleProvider.controller';

/** Loads a vehicle and checks that its provider belongs to the caller. */
async function loadOwnedVehicle(req: AuthRequest, vehicleId: string) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }

  if (req.user?.role === UserRole.ADMIN) return vehicle;

  const provider = await providerForUser(req);
  if (!provider) {
    throw new ApiError('Not authorized to manage this vehicle', 403, 'FORBIDDEN');
  }
  if (String(vehicle.provider_id) !== String(provider._id)) {
    throw new ApiError('Not authorized to manage this vehicle', 403, 'FORBIDDEN');
  }

  return vehicle;
}

export const getAllVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const vehicles = await Vehicle.find()
      .populate('provider_id', 'name')
      .sort({ price_per_day: 1 });

    res.json({
      success: true,
      vehicles,
    });
  } catch (error) {
    next(error);
  }
};

export const getVehicleById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const vehicle = await Vehicle.findById(id).populate(
      'provider_id',
      'name email phone description rating',
    );

    if (!vehicle) {
      throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    }

    // Detail pages show the next few rental days so a guest can pick a date
    // without a second round trip.
    const availability = await VehicleAvailability.find({
      vehicle_id: vehicle._id,
      date: { $gte: startOfUtcDay(new Date()) },
    })
      .sort({ date: 1 })
      .limit(30);

    res.json({
      success: true,
      vehicle,
      availability,
    });
  } catch (error) {
    next(error);
  }
};

export const createVehicle = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = parseOrThrow(createVehicleSchema, req.body);

    const provider = await providerForUser(req);
    if (!provider) {
      throw new ApiError(
        'No vehicle provider profile is linked to this account',
        404,
        'PROVIDER_NOT_FOUND',
      );
    }

    const vehicle = await Vehicle.create({ ...data, provider_id: provider._id });

    res.status(201).json({
      success: true,
      vehicle,
    });
  } catch (error) {
    next(error);
  }
};

export const updateVehicle = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const data = parseOrThrow(updateVehicleSchema, req.body);

    // Ownership is enforced before the write, never by filtering the update.
    await loadOwnedVehicle(req, id);

    const vehicle = await Vehicle.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('provider_id', 'name');

    res.json({
      success: true,
      vehicle,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteVehicle = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    await loadOwnedVehicle(req, id);

    await Vehicle.findByIdAndDelete(id);
    await VehicleAvailability.deleteMany({ vehicle_id: id });

    res.json({
      success: true,
      message: 'Vehicle deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getVehicleAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const { date } = req.query;

    const availability = await VehicleAvailability.find({
      vehicle_id: id,
      date:
        typeof date === 'string'
          ? parseDateInput(date, 'date')
          : { $gte: startOfUtcDay(new Date()) },
    }).sort({ date: 1 });

    res.json({
      success: true,
      availability,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Publishes availability for a single rental day.
 *
 * The cap is the provider's declared fleet size when one exists, otherwise the
 * vehicle capacity. The upsert is keyed on the composite (vehicle_id, date)
 * index, which makes republishing a day idempotent.
 */
export const createVehicleAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const data = parseOrThrow(createVehicleAvailabilitySchema, req.body);
    const vehicle = await loadOwnedVehicle(req, id);

    if (data.vehicle_id && data.vehicle_id !== id) {
      throw new ApiError('vehicle_id does not match the request path', 400, 'VEHICLE_ID_MISMATCH');
    }

    const capacity = vehicle.default_units ?? vehicle.capacity;
    if (data.available_units > capacity) {
      throw new ApiError(
        `available_units cannot exceed the fleet size of ${capacity}`,
        400,
        'INVENTORY_EXCEEDED',
      );
    }

    const date = parseDateInput(data.date, 'date');
    const availability = await VehicleAvailability.findOneAndUpdate(
      { vehicle_id: vehicle._id, date },
      {
        $set: {
          available_units: data.available_units,
          status: data.status ?? (data.available_units > 0 ? 'available' : 'unavailable'),
        },
        $setOnInsert: { vehicle_id: vehicle._id, date },
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.status(201).json({ success: true, availability });
  } catch (error) {
    next(error);
  }
};

/** Publish a whole rental range in one request — the dashboard's main action. */
export const bulkUpsertVehicleAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const data = parseOrThrow(bulkVehicleAvailabilitySchema, req.body);
    const vehicle = await loadOwnedVehicle(req, id);

    if (data.vehicle_id && data.vehicle_id !== id) {
      throw new ApiError('vehicle_id does not match the request path', 400, 'VEHICLE_ID_MISMATCH');
    }

    const capacity = vehicle.default_units ?? vehicle.capacity;
    if (data.available_units > capacity) {
      throw new ApiError(
        `available_units cannot exceed the fleet size of ${capacity}`,
        400,
        'INVENTORY_EXCEEDED',
      );
    }

    const start = parseDateInput(data.start_date, 'start date');
    const end = parseDateInput(data.end_date, 'end date');
    const days = eachNight(start, end);
    const status = data.status ?? (data.available_units > 0 ? 'available' : 'unavailable');

    const operations = days.map((day) => ({
      updateOne: {
        filter: { vehicle_id: vehicle._id, date: day },
        update: {
          $set: { available_units: data.available_units, status },
          $setOnInsert: { vehicle_id: vehicle._id, date: day },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await VehicleAvailability.bulkWrite(operations);
    }

    res.json({ success: true, updated: operations.length });
  } catch (error) {
    next(error);
  }
};

/** Authoritative rental price. Mirrors `GET /rooms/:id/quote` for vehicles. */
export const getVehicleQuote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'vehicle id');
    const query = parseOrThrow(vehicleQuoteSchema, req.query);

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    }

    const quote = await quoteRental(vehicle, query.start_date, query.end_date, query.units);
    res.json({ success: true, quote });
  } catch (error) {
    next(error);
  }
};

export { upcomingVehicleAvailability };
