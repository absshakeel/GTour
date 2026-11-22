import type { Metadata } from 'next';
import VehicleProviderDashboardShell from './VehicleProviderDashboardShell';
import VehicleProviderDashboard from '@/components/dashboard/VehicleProviderDashboard';

export const metadata: Metadata = {
  title: 'Vehicle provider — GTour',
  description: 'Manage your fleet, availability and rental requests.',
};

export default function VehicleProviderDashboardPage() {
  return (
    <VehicleProviderDashboardShell>
      <VehicleProviderDashboard />
    </VehicleProviderDashboardShell>
  );
}