import { BookingStatus } from '@gtour/shared-types';
import {
  canTransition,
  describeAllowedTransitions,
  releasesInventory,
} from '../src/services/bookingWorkflow';

const TERMINAL = [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW];

describe('booking status workflow', () => {
  describe('canTransition', () => {
    it.each([
      [BookingStatus.PENDING, BookingStatus.CONFIRMED],
      [BookingStatus.PENDING, BookingStatus.CANCELLED],
      [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
      [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
      [BookingStatus.CONFIRMED, BookingStatus.NO_SHOW],
    ])('allows %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    it.each([
      [BookingStatus.PENDING, BookingStatus.COMPLETED],
      [BookingStatus.PENDING, BookingStatus.NO_SHOW],
      [BookingStatus.CONFIRMED, BookingStatus.PENDING],
      [BookingStatus.PENDING, BookingStatus.PENDING],
    ])('rejects %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });

    it.each(TERMINAL)('treats %s as terminal', (status) => {
      expect(describeAllowedTransitions(status)).toEqual([]);
      expect(Object.values(BookingStatus).some((next) => canTransition(status, next))).toBe(false);
    });

    it('cannot resurrect a cancelled booking', () => {
      expect(canTransition(BookingStatus.CANCELLED, BookingStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('releasesInventory', () => {
    it('releases rooms when nothing changes status', () => {
      expect(releasesInventory(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)).toBe(true);
      expect(releasesInventory(BookingStatus.PENDING, BookingStatus.CANCELLED)).toBe(true);
      expect(releasesInventory(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW)).toBe(true);
    });

    it('keeps rooms held for non-releasing moves', () => {
      expect(releasesInventory(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toBe(false);
      expect(releasesInventory(BookingStatus.CONFIRMED, BookingStatus.COMPLETED)).toBe(false);
      expect(releasesInventory(BookingStatus.PENDING, BookingStatus.PENDING)).toBe(false);
    });
  });
});