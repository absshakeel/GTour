import type { BookingStatusValue } from '@gtour/utils';

export type StatusTone = 'neutral' | 'sea' | 'terracotta' | 'gold' | 'ink';

export const BOOKING_STATUS_TONES: Record<BookingStatusValue, StatusTone> = {
  pending: 'gold',
  confirmed: 'sea',
  completed: 'neutral',
  cancelled: 'terracotta',
  no_show: 'ink',
};

const LABELS: Record<BookingStatusValue, string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export function bookingStatusLabel(status: BookingStatusValue): string {
  return LABELS[status] ?? status.replace('_', ' ');
}

/** `12 Mar 2025` — stable across locales so tests and SSR agree. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** `12 Mar` — for compact ranges. */
export function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Calendar date (`yyyy-mm-dd`) from an ISO timestamp, in UTC. */
export function toCalendarDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Whole nights between two ISO timestamps. */
export function stayNights(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}