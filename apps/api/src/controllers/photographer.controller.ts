import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Photographer from '../models/Photographer';
import PhotographyService from '../models/PhotographyService';
import Portfolio from '../models/Portfolio';
import Booking from '../models/Booking';
import User from '../models/User';
import { createPhotographerSchema, updatePhotographerSchema } from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';

/**
 * Resolves the photographer record owned by the signed-in account.
 *
 * `user_id` is the authoritative link. Rows seeded before that field existed
 * have no owner, so the account email is used as a fallback and the link is
 * healed for the next request. Every mutation below goes through this, or
 * through `loadOwnedPhotographer`, so ownership decisions live in one place.
 */
export async function photographerForUser(req: AuthRequest) {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const byUser = await Photographer.findOne({ user_id: req.user.userId });
  if (byUser) return byUser;

  const account = await User.findById(req.user.userId).select('email');
  if (!account?.email) return null;

  const byEmail = await Photographer.findOne({
    email: account.email,
    $or: [{ user_id: { $exists: false } }, { user_id: null }],
  });
  if (!byEmail) return null;

  byEmail.user_id = new mongoose.Types.ObjectId(req.user.userId);
  await byEmail.save();
  return byEmail;
}

/** Loads a photographer and checks that the caller owns it. */
async function loadOwnedPhotographer(req: AuthRequest, photographerId: string) {
  const photographer = await Photographer.findById(photographerId);
  if (!photographer) {
    throw new ApiError('Photographer not found', 404, 'PHOTOGRAPHER_NOT_FOUND');
  }

  if (req.user?.role === UserRole.ADMIN) return photographer;

  const owned = await photographerForUser(req);
  if (!owned || String(owned._id) !== String(photographer._id)) {
    throw new ApiError('Not authorized to manage this photographer', 403, 'FORBIDDEN');
  }

  return photographer;
}

export const getAllPhotographers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const photographers = await Photographer.find()
      .populate('destination_id', 'name')
      .sort({ rating: -1 });

    res.json({
      success: true,
      photographers,
    });
  } catch (error) {
    next(error);
  }
};

export const getPhotographerById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'photographer id');
    const photographer = await Photographer.findById(id).populate('destination_id', 'name');

    if (!photographer) {
      throw new ApiError('Photographer not found', 404, 'PHOTOGRAPHER_NOT_FOUND');
    }

    const [services, portfolio] = await Promise.all([
      PhotographyService.find({
        photographer_id: photographer._id,
        is_active: { $ne: false },
      }).sort({ price_per_session: 1 }),
      Portfolio.find({ photographer_id: photographer._id }).sort({ created_at: -1 }),
    ]);

    res.json({
      success: true,
      photographer,
      services,
      portfolio,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates the photographer profile for the signed-in account.
 *
 * A photographer only ever has one profile, so a second call is rejected rather
 * than creating an orphan that `photographerForUser` would never find again.
 */
export const createPhotographer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    const data = parseOrThrow(createPhotographerSchema, req.body);

    const existing = await Photographer.findOne({ user_id: req.user.userId });
    if (existing) {
      throw new ApiError(
        'This account already has a photographer profile',
        409,
        'PHOTOGRAPHER_EXISTS',
      );
    }

    const photographer = await Photographer.create({
      ...data,
      user_id: new mongoose.Types.ObjectId(req.user.userId),
    });

    res.status(201).json({
      success: true,
      photographer,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePhotographer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'photographer id');
    const data = parseOrThrow(updatePhotographerSchema, req.body);

    await loadOwnedPhotographer(req, id);

    const photographer = await Photographer.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('destination_id', 'name');

    res.json({
      success: true,
      photographer,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePhotographer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'photographer id');
    await loadOwnedPhotographer(req, id);

    await Photographer.findByIdAndDelete(id);
    await PhotographyService.deleteMany({ photographer_id: id });
    await Portfolio.deleteMany({ photographer_id: id });

    res.json({
      success: true,
      message: 'Photographer deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider workspace payload: the signed-in photographer's profile plus the
 * services, portfolios and shoot bookings attached to it.
 */
export const getMyPhotographerProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const photographer = await photographerForUser(req);

    if (!photographer) {
      res.json({ success: true, photographer: null, services: [], portfolio: [], bookings: [] });
      return;
    }

    const serviceIds = await PhotographyService.distinct('_id', {
      photographer_id: photographer._id,
    });

    const [services, portfolio, bookings] = await Promise.all([
      PhotographyService.find({ photographer_id: photographer._id }).sort({ price_per_session: 1 }),
      Portfolio.find({ photographer_id: photographer._id }).sort({ created_at: -1 }),
      Booking.find({ photography_service_id: { $in: serviceIds } })
        .populate('user_id', 'name email')
        .populate('photography_service_id', 'name price_per_session duration_hours')
        .sort({ start_date: 1 }),
    ]);

    res.json({
      success: true,
      photographer,
      services,
      portfolio,
      bookings,
    });
  } catch (error) {
    next(error);
  }
};
