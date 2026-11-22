'use client';

import AuthGuard, { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';

const NAV: DashNavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard/vehicles', label: 'Overview', icon: 'overview', exact: true },
      { href: '/dashboard/vehicles#fleet', label: 'Fleet', icon: 'vehicle' },
      { href: '/dashboard/vehicles#rentals', label: 'Rentals', icon: 'bookings' },
    ],
  },
  {
    title: 'Preview',
    items: [{ href: '/vehicles', label: 'Public vehicles', icon: 'compass', external: true }],
  },
];

/** Shell for the vehicle-provider workspace; the API re-checks the role per request. */
export default function VehicleProviderDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard roles={['vehicle_provider', 'admin']}>
      <DashShell
        eyebrow="Vehicle provider"
        title="Your fleet"
        subtitle="Vehicles, availability and rental requests."
        nav={NAV}
        footerHref="/"
        footerLabel="Open public site"
      >
        {children}
      </DashShell>
    </AuthGuard>
  );
}