import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import Destination from '../models/Destination';
import Category from '../models/Category';
import Location from '../models/Location';
import {
  createDestinationSchema,
  destinationSearchSchema,
  updateDestinationSchema,
} from '@gtour/validation';
import { ApiError } from '../utils/ApiError';

const SORT_FIELDS: Record<string, string> = {
  rating: 'average_rating',
  views: 'views',
  name: 'name',
  created_at: 'createdAt',
};

function assertObjectId(id: string | string[] | undefined, label = 'id'): string {
  const value = Array.isArray(id) ? id[0] : id;
  if (!value || !mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
  return value;
}

function handleZod(error: unknown): never | void {
  if (error instanceof ZodError) {
    throw new ApiError('Validation failed', 400, 'VALIDATION_ERROR', error.flatten());
  }
}

export const getAllDestinations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = destinationSearchSchema.parse(req.query);
    const sortField = SORT_FIELDS[parsed.sort_by] ?? 'average_rating';
    const sortOrder = parsed.sort_order === 'asc' ? 1 : -1;
    const query = { archived_at: null as Date | null };

    const [destinations, total] = await Promise.all([
      Destination.find(query)
        .populate('category_id', 'name icon')
        .populate('location_id', 'name country region')
        .sort({ [sortField]: sortOrder, _id: -1 })
        .skip((parsed.page - 1) * parsed.limit)
        .limit(parsed.limit),
      Destination.countDocuments(query),
    ]);

    res.json({
      success: true,
      destinations,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        pages: Math.ceil(total / parsed.limit) || 1,
      },
    });
  } catch (error) {
    try {
      handleZod(error);
    } catch (e) {
      return next(e);
    }
    next(error);
  }
};

export const getDestinationById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'destination id');
    const destination = await Destination.findOne({ _id: id, archived_at: null })
      .populate('category_id', 'name icon')
      .populate('location_id', 'name country region');

    if (!destination) {
      throw new ApiError('Destination not found', 404, 'DESTINATION_NOT_FOUND');
    }

    await Destination.updateOne({ _id: id }, { $inc: { views: 1 } });
    destination.views = (destination.views ?? 0) + 1;

    res.json({ success: true, destination });
  } catch (error) {
    next(error);
  }
};

export const searchDestinations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = destinationSearchSchema.parse(req.query);
    const query: Record<string, unknown> = { archived_at: null };

    if (parsed.category_id) query.category_id = assertObjectId(parsed.category_id, 'category_id');
    if (parsed.location_id) query.location_id = assertObjectId(parsed.location_id, 'location_id');
    if (parsed.min_rating !== undefined) query.average_rating = { $gte: parsed.min_rating };
    if (parsed.max_budget !== undefined) query.estimated_budget = { $lte: parsed.max_budget };
    if (parsed.search?.trim()) query.$text = { $search: parsed.search.trim() };

    const sortField = SORT_FIELDS[parsed.sort_by] ?? 'average_rating';
    const sortOrder = parsed.sort_order === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder, _id: -1 };

    const [destinations, total] = await Promise.all([
      Destination.find(query)
        .populate('category_id', 'name icon')
        .populate('location_id', 'name country region')
        .sort(sort)
        .skip((parsed.page - 1) * parsed.limit)
        .limit(parsed.limit),
      Destination.countDocuments(query),
    ]);

    res.json({
      success: true,
      destinations,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        pages: Math.ceil(total / parsed.limit) || 1,
      },
    });
  } catch (error) {
    try {
      handleZod(error);
    } catch (e) {
      return next(e);
    }
    next(error);
  }
};

export const createDestination = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = createDestinationSchema.parse(req.body);
    assertObjectId(data.category_id, 'category_id');
    assertObjectId(data.location_id, 'location_id');

    const [category, location] = await Promise.all([
      Category.findById(data.category_id),
      Location.findById(data.location_id),
    ]);
    if (!category) throw new ApiError('Category not found', 400, 'INVALID_REFERENCE');
    if (!location) throw new ApiError('Location not found', 400, 'INVALID_REFERENCE');

    const destination = await Destination.create({ ...data, archived_at: null });
    const populated = await destination.populate([
      { path: 'category_id', select: 'name icon' },
      { path: 'location_id', select: 'name country region' },
    ]);

    res.status(201).json({ success: true, destination: populated });
  } catch (error) {
    try {
      handleZod(error);
    } catch (e) {
      return next(e);
    }
    next(error);
  }
};

export const updateDestination = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'destination id');
    const data = updateDestinationSchema.parse(req.body);
    if (data.category_id) assertObjectId(data.category_id, 'category_id');
    if (data.location_id) assertObjectId(data.location_id, 'location_id');

    const destination = await Destination.findOneAndUpdate(
      { _id: id, archived_at: null },
      data,
      { new: true, runValidators: true }
    )
      .populate('category_id', 'name icon')
      .populate('location_id', 'name country region');

    if (!destination) {
      throw new ApiError('Destination not found', 404, 'DESTINATION_NOT_FOUND');
    }

    res.json({ success: true, destination });
  } catch (error) {
    try {
      handleZod(error);
    } catch (e) {
      return next(e);
    }
    next(error);
  }
};

export const deleteDestination = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = assertObjectId(req.params.id, 'destination id');
    const destination = await Destination.findOneAndUpdate(
      { _id: id, archived_at: null },
      { archived_at: new Date() },
      { new: true }
    );
    if (!destination) {
      throw new ApiError('Destination not found', 404, 'DESTINATION_NOT_FOUND');
    }

    res.json({ success: true, message: 'Destination archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const getDestinationFilters = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [categories, locations] = await Promise.all([
      Category.find().select('name icon').sort({ name: 1 }),
      Location.find().select('name country region').sort({ name: 1 }),
    ]);

    res.json({ success: true, categories, locations });
  } catch (error) {
    next(error);
  }
};