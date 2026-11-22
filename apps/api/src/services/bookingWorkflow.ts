import { BookingStatus } from '@gtour/shared-types';

/**
 * Allowed booking status transitions.
 *
 * The workflow is intentionally narrow: a provider confirms or rejects a
 * pending request, and only a confirmed stay can complete or be marked as a
 * no-show. Terminal states cannot move again, which prevents a cancelled
 * booking from being silently resurrected and double-counting inventory.
 */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.NO_SHOW]: [],
};

/** True when the requested move is legal for the current status. */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Transitions that give the room nights back to inventory. */
export function releasesInventory(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return to === BookingStatus.CANCELLED || to === BookingStatus.NO_SHOW;
}

export function describeAllowedTransitions(from: BookingStatus): string[] {
  return TRANSITIONS[from] ?? [];
}