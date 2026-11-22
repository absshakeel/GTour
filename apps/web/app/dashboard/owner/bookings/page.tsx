import type { Metadata } from 'next';
import OwnerDashboardShell from '../OwnerDashboardShell';
import BookingQueue from '@/components/owner/BookingQueue';

export const metadata: Metadata = {
  title: 'Owner bookings',
  description: 'Review and action booking requests for your properties.',
};

export default function OwnerBookingsPage() {
  return (
    <OwnerDashboardShell
      title="Booking requests"
      subtitle="Review, confirm or decline the bookings guests have placed against your properties."
    >
      <BookingQueue />
    </OwnerDashboardShell>
  );
}
