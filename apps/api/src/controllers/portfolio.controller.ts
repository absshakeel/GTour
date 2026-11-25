import { Request, Response, NextFunction } from 'express';
import PhotographyService from '../models/PhotographyService';
import Portfolio from '../models/Portfolio';
import { createPortfolioSchema, updatePortfolioSchema } from '@gtour/validation';
import { UserRole } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, parseOrThrow } from '../utils/http';
import { photographerForUser } from './photographer.controller';

/** Loads a portfolio entry and checks that the caller owns its photographer. */
async function loadOwnedPortfolio(req: AuthRequest, portfolioId: string) {
  const entry = await Portfolio.findById(portfolioId);
  if (!entry) {
    throw new ApiError('Portfolio entry not found', 404, 'PORTFOLIO_NOT_FOUND');
  }

  if (req.user?.role === UserRole.ADMIN) return entry;

  const photographer = await photographerForUser(req);
  if (!photographer || String(entry.photographer_id) !== String(photographer._id)) {
    throw new ApiError('Not authorized to manage this portfolio entry', 403, 'FORBIDDEN');
  }

  return entry;
}

/** Portfolio entries for one service — public, used by the detail page. */
export const getPortfolioByService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const serviceId = assertObjectId(req.params.serviceId, 'service id');
    const portfolio = await Portfolio.find({ service_id: serviceId }).sort({ created_at: -1 });

    res.json({ success: true, portfolio });
  } catch (error) {
    next(error);
  }
};

/**
 * Adds a portfolio entry for one of the signed-in photographer's own services.
 *
 * The service is re-read rather than trusted, so an entry can never be attached
 * to another photographer's service.
 */
export const createPortfolio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = parseOrThrow(createPortfolioSchema, req.body);

    const photographer = await photographerForUser(req);
    if (!photographer) {
      throw new ApiError(
        'No photographer profile is linked to this account',
        404,
        'PHOTOGRAPHER_NOT_FOUND',
      );
    }

    const serviceId = assertObjectId(data.service_id, 'service id');
    const service = await PhotographyService.findById(serviceId).select('photographer_id');
    if (!service) {
      throw new ApiError('Service not found', 404, 'SERVICE_NOT_FOUND');
    }
    if (String(service.photographer_id) !== String(photographer._id)) {
      throw new ApiError('Not authorized to add work to this service', 403, 'FORBIDDEN');
    }

    // One portfolio entry per service is the ERD rule, so re-posting replaces
    // the existing gallery instead of failing the unique index.
    const entry = await Portfolio.findOneAndUpdate(
      { photographer_id: photographer._id, service_id: service._id },
      {
        $set: { images: data.images, description: data.description },
        $setOnInsert: { photographer_id: photographer._id, service_id: service._id },
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.status(201).json({ success: true, portfolio: entry });
  } catch (error) {
    next(error);
  }
};

export const updatePortfolio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'portfolio id');
    const data = parseOrThrow(updatePortfolioSchema, req.body);

    await loadOwnedPortfolio(req, id);

    const entry = await Portfolio.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, portfolio: entry });
  } catch (error) {
    next(error);
  }
};

export const deletePortfolio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'portfolio id');
    await loadOwnedPortfolio(req, id);

    await Portfolio.findByIdAndDelete(id);

    res.json({ success: true, message: 'Portfolio entry deleted successfully' });
  } catch (error) {
    next(error);
  }
};
