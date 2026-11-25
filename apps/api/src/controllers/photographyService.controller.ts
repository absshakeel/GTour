import { Request, Response, NextFunction } from 'express';
import PhotographyService from '../models/PhotographyService';
import Portfolio from '../models/Portfolio';
import { createPhotographyServiceSchema, updatePhotographyServiceSchema } from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { photographerForUser } from './photographer.controller';

/** Loads a service and checks that its photographer belongs to the caller. */
async function loadOwnedService(req: AuthRequest, serviceId: string) {
  const service = await PhotographyService.findById(serviceId);
  if (!service) {
    throw new ApiError('Service not found', 404, 'SERVICE_NOT_FOUND');
  }

  if (req.user?.role === UserRole.ADMIN) return service;

  const photographer = await photographerForUser(req);
  if (!photographer || String(service.photographer_id) !== String(photographer._id)) {
    throw new ApiError('Not authorized to manage this service', 403, 'FORBIDDEN');
  }

  return service;
}

export const getAllServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Hidden services are filtered out of the public catalogue but stay visible
    // to their owner through the workspace endpoint.
    const services = await PhotographyService.find({ is_active: { $ne: false } })
      .populate('photographer_id', 'name profile_image')
      .sort({ price_per_session: 1 });

    res.json({
      success: true,
      services,
    });
  } catch (error) {
    next(error);
  }
};

export const getServiceById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'service id');
    const service = await PhotographyService.findById(id).populate(
      'photographer_id',
      'name profile_image bio rating phone email',
    );

    if (!service) {
      throw new ApiError('Service not found', 404, 'SERVICE_NOT_FOUND');
    }

    const portfolio = await Portfolio.find({ service_id: service._id });

    res.json({
      success: true,
      service,
      portfolio,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Publishes a service under the signed-in photographer.
 *
 * The owner is never read from the body: it comes from the account, so a
 * provider cannot inject someone else's `photographer_id`.
 */
export const createPhotographyService = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = parseOrThrow(createPhotographyServiceSchema, req.body);

    const photographer = await photographerForUser(req);
    if (!photographer) {
      throw new ApiError(
        'No photographer profile is linked to this account',
        404,
        'PHOTOGRAPHER_NOT_FOUND',
      );
    }

    const service = await PhotographyService.create({
      ...data,
      photographer_id: photographer._id,
    });

    res.status(201).json({
      success: true,
      service,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePhotographyService = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'service id');
    const data = parseOrThrow(updatePhotographyServiceSchema, req.body);

    await loadOwnedService(req, id);

    const service = await PhotographyService.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('photographer_id', 'name profile_image');

    res.json({
      success: true,
      service,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePhotographyService = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'service id');
    await loadOwnedService(req, id);

    await PhotographyService.findByIdAndDelete(id);
    await Portfolio.deleteMany({ service_id: id });

    res.json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
