import type { Metadata } from 'next';
import OwnerDashboardShell from './OwnerDashboardShell';
import PropertyManager from '@/components/owner/PropertyManager';

export const metadata: Metadata = {
  title: 'Owner dashboard',
  description: 'Manage your properties, rooms and nightly availability.',
};

export default function OwnerDashboardPage() {
  return (
    <OwnerDashboardShell
      title="Your properties"
      subtitle="Publish rooms, keep nightly availability current, and action booking requests as they arrive."
    >
      <PropertyManager />
    </OwnerDashboardShell>
  );
}
