import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';

/** Mongo surfaces schema/driver problems as typed errors that map to HTTP 400. */
function isDatabaseValidationError(err: Error): boolean {
  return err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        details: err.details
      }
    });
    return;
  }

  if (isDatabaseValidationError(err)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'The submitted data could not be saved',
        code: 'DATABASE_VALIDATION_ERROR'
      }
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  });
};