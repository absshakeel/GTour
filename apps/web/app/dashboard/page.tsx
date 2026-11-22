import type { Metadata } from 'next';
import DashboardShell from './DashboardShell';
import TouristDashboard from '@/components/dashboard/TouristDashboard';

export const metadata: Metadata = {
  title: 'Your dashboard',
  description: 'Your bookings, upcoming trips and account details on GTour.',
};

export default function DashboardPage() {
  return (
    <DashboardShell>
      <TouristDashboard />
    </DashboardShell>
  );
}
