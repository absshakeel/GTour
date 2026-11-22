import { ApiError } from './ApiError';

/**
 * Accommodation stays are counted in whole calendar nights, so every date that
 * reaches the database or a range query is normalised to UTC midnight first.
 * Storing partial timestamps would let the same night exist twice and would
 * make the (room_id, date) availability key unreliable.
 */
export function startOfUtcDay(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('Invalid date', 400, 'INVALID_DATE');
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Accepts an ISO timestamp or a `YYYY-MM-DD` date from a date input. */
export function parseDateInput(value: string, label: string): Date {
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(`Invalid ${label}`, 400, 'INVALID_DATE');
  }
  return startOfUtcDay(date);
}

/**
 * Number of nights between two UTC-midnight dates. The end date is exclusive:
 * a stay from the 1st to the 3rd is two nights.
 */
export function nightsBetween(start: Date, end: Date): number {
  const ms = startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every night in the stay, end date exclusive: [start, end). */
export function eachNight(start: Date, end: Date): Date[] {
  const nights: Date[] = [];
  const cursor = startOfUtcDay(start);
  const limit = startOfUtcDay(end);

  while (cursor.getTime() < limit.getTime()) {
    nights.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return nights;
}

/**
 * Validates a stay range and returns normalised, end-exclusive bounds.
 * A hotel booking must cover at least one night and cannot be open-ended.
 */
export function normaliseStayRange(
  startValue: Date | string,
  endValue: Date | string,
  maxNights = 60
): { start: Date; end: Date; nights: number } {
  const start = startOfUtcDay(startValue);
  const end = startOfUtcDay(endValue);
  const nights = nightsBetween(start, end);

  if (nights < 1) {
    throw new ApiError('End date must be after start date', 400, 'INVALID_DATES');
  }
  if (nights > maxNights) {
    throw new ApiError(`A stay cannot exceed ${maxNights} nights`, 400, 'STAY_TOO_LONG');
  }

  return { start, end, nights };
}
