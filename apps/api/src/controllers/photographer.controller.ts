import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Photographer from '../models/Photographer';
import PhotographyService from '../models/PhotographyService';
import Portfolio from '../models/Portfolio';
import Booking from '../models/Booking';
import User from '../models/User';
import { createPhotographerSchema, updatePhotographerSchema } from '@gtour/validation';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';

/**
 * Resolves the photographer record owned by the signed-in account.
 *
 * `user_id` is the authoritative link. Rows seeded before that field existed
 * have no owner, so the account email is used as a fallback and the link is
 * healed for the next request.
 */
async function photographerForUser(req: AuthRequest) {
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

export const getAllPhotographers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const photographers = await Photographer.find()
      .populate('destination_id', 'name')
      .sort({ rating: -1 });

    res.json({
      success: true,
      photographers
    });
  } catch (error) {
    next(error);
  }
};

export const getPhotographerById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const photographer = await Photographer.findById(req.params.id)
      .populate('destination_id', 'name');

    if (!photographer) {
      throw new ApiError('Photographer not found', 404, 'PHOTOGRAPHER_NOT_FOUND');
    }

    const services = await PhotographyService.find({ photographer_id: req.params.id });

    res.json({
      success: true,
      photographer,
      services
    });
  } catch (error) {
    next(error);
  }
};

export const createPhotographer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createPhotographerSchema.parse(req.body);

    const photographer = await Photographer.create(validatedData);

    res.status(201).json({
      success: true,
      photographer
    });
  } catch (error) {
    next(error);
  }
};

export const updatePhotographer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updatePhotographerSchema.parse(req.body);

    const photographer = await Photographer.findByIdAndUpdate(
      req.params.id,
      validatedData,
      { new: true, runValidators: true }
    ).populate('destination_id', 'name');

    if (!photographer) {
      throw new ApiError('Photographer not found', 404, 'PHOTOGRAPHER_NOT_FOUND');
    }

    res.json({
      success: true,
      photographer
    });
  } catch (error) {
    next(error);
  }
};

export const deletePhotographer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const photographer = await Photographer.findByIdAndDelete(req.params.id);
    if (!photographer) {
      throw new ApiError('Photographer not found', 404, 'PHOTOGRAPHER_NOT_FOUND');
    }

    await PhotographyService.deleteMany({ photographer_id: req.params.id });
    await Portfolio.deleteMany({ photographer_id: req.params.id });

    res.json({
      success: true,
      message: 'Photographer deleted successfully'
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
  next: NextFunction
): Promise<void> => {
  try {
    const photographer = await photographerForUser(req);

    if (!photographer) {
      res.json({ success: true, photographer: null, services: [], portfolio: [], bookings: [] });
      return;
    }

    const [services, portfolio, bookings] = await Promise.all([
      PhotographyService.find({ photographer_id: photographer._id }).sort({ price_per_session: 1 }),
      Portfolio.find({ photographer_id: photographer._id }).sort({ created_at: -1 }),
      Booking.find({ photography_service_id: { $in: await serviceIds(photographer._id) } })
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

async function serviceIds(photographerId: mongoose.Types.ObjectId) {
  const services = await PhotographyService.find({ photographer_id: photographerId }).select('_id');
  return services.map((service) => service._id);
}
