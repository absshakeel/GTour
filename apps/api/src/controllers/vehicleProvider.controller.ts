import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Vehicle from '../models/Vehicle';
import VehicleAvailability from '../models/VehicleAvailability';
import VehicleProvider from '../models/VehicleProvider';
import Booking from '../models/Booking';
import User from '../models/User';
import { createVehicleProviderSchema, updateVehicleProviderSchema } from '@gtour/validation';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';

/**
 * Resolves the provider record owned by the signed-in account, healing rows
 * that predate the `user_id` link by matching the account email once.
 */
async function providerForUser(req: AuthRequest) {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const byUser = await VehicleProvider.findOne({ user_id: req.user.userId });
  if (byUser) return byUser;

  const account = await User.findById(req.user.userId).select('email');
  if (!account?.email) return null;

  const byEmail = await VehicleProvider.findOne({
    email: account.email,
    $or: [{ user_id: { $exists: false } }, { user_id: null }],
  });
  if (!byEmail) return null;

  byEmail.user_id = new mongoose.Types.ObjectId(req.user.userId);
  await byEmail.save();
  return byEmail;
}

export const getAllProviders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const providers = await VehicleProvider.find()
      .sort({ rating: -1 });

    res.json({
      success: true,
      providers
    });
  } catch (error) {
    next(error);
  }
};

export const getProviderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const provider = await VehicleProvider.findById(req.params.id);

    if (!provider) {
      throw new ApiError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    const vehicles = await Vehicle.find({ provider_id: req.params.id });

    res.json({
      success: true,
      provider,
      vehicles
    });
  } catch (error) {
    next(error);
  }
};

export const createVehicleProvider = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createVehicleProviderSchema.parse(req.body);

    const provider = await VehicleProvider.create(validatedData);

    res.status(201).json({
      success: true,
      provider
    });
  } catch (error) {
    next(error);
  }
};

export const updateVehicleProvider = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateVehicleProviderSchema.parse(req.body);

    const provider = await VehicleProvider.findByIdAndUpdate(
      req.params.id,
      validatedData,
      { new: true, runValidators: true }
    );

    if (!provider) {
      throw new ApiError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    res.json({
      success: true,
      provider
    });
  } catch (error) {
    next(error);
  }
};

export const deleteVehicleProvider = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const provider = await VehicleProvider.findByIdAndDelete(req.params.id);
    if (!provider) {
      throw new ApiError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    await Vehicle.deleteMany({ provider_id: req.params.id });

    res.json({
      success: true,
      message: 'Provider deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Provider workspace payload: the signed-in operator's profile, its fleet with
 * upcoming availability, and the vehicle bookings attached to that fleet.
 */
export const getMyProviderProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const provider = await providerForUser(req);

    if (!provider) {
      res.json({ success: true, provider: null, vehicles: [], availability: [], bookings: [] });
      return;
    }

    const vehicles = await Vehicle.find({ provider_id: provider._id }).sort({ price_per_day: 1 });
    const vehicleIds = vehicles.map((vehicle) => vehicle._id);

    const [availability, bookings] = await Promise.all([
      VehicleAvailability.find({
        vehicle_id: { $in: vehicleIds },
        date: { $gte: new Date(new Date().toISOString().slice(0, 10)) },
      })
        .sort({ date: 1 })
        .limit(120),
      Booking.find({ vehicle_id: { $in: vehicleIds } })
        .populate('user_id', 'name email')
        .populate('vehicle_id', 'name type capacity price_per_day')
        .sort({ start_date: 1 }),
    ]);

    res.json({ success: true, provider, vehicles, availability, bookings });
  } catch (error) {
    next(error);
  }
};
