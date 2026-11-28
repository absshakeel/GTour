import type { Metadata } from 'next';
import DashboardShell from '../DashboardShell';
import TripsBoard from '@/components/trips/TripsBoard';

export const metadata: Metadata = {
  title: 'My trips',
  description: 'Every stay, photo shoot and vehicle you booked on GTour, grouped by destination.',
};

export default function TripsPage() {
  return (
    <DashboardShell>
      <TripsBoard />
    </DashboardShell>
  );
}
