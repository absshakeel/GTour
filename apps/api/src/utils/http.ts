import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from './ApiError';

/** Mongo ids arrive from URLs and bodies as untrusted strings. */
export function assertObjectId(id: string | string[] | undefined, label = 'id'): string {
  const value = Array.isArray(id) ? id[0] : id;
  if (!value || !mongoose.isValidObjectId(value)) {
    throw new ApiError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
  return value;
}

/**
 * Converts a zod failure into the shared error envelope so clients get
 * field-level details instead of a generic 500.
 */
export function handleZod(error: unknown): never | void {
  if (error instanceof ZodError) {
    throw new ApiError('Validation failed', 400, 'VALIDATION_ERROR', error.flatten());
  }
}

/** Runs a validated parse and maps zod errors onto ApiError. */
export function parseOrThrow<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    handleZod(error);
    throw error;
  }
}