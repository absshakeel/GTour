import type { Metadata } from 'next';
import PhotographerDashboardShell from './PhotographerDashboardShell';
import PhotographerDashboard from '@/components/dashboard/PhotographerDashboard';

export const metadata: Metadata = {
  title: 'Photographer studio — GTour',
  description: 'Manage your photography services, portfolio and booked shoots.',
};

export default function PhotographerDashboardPage() {
  return (
    <PhotographerDashboardShell>
      <PhotographerDashboard />
    </PhotographerDashboardShell>
  );
}