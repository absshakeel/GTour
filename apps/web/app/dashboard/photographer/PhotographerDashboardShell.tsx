'use client';

import AuthGuard, { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';

const NAV: DashNavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard/photographer', label: 'Overview', icon: 'overview', exact: true },
      { href: '/dashboard/photographer#shoots', label: 'Shoots', icon: 'bookings' },
      { href: '/dashboard/photographer#portfolio', label: 'Portfolio', icon: 'camera' },
    ],
  },
  {
    title: 'Preview',
    items: [{ href: '/photographers', label: 'Public photographers', icon: 'compass', external: true }],
  },
];

/** Shell for the photographer workspace; the API re-checks the role per request. */
export default function PhotographerDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard roles={['photographer', 'admin']}>
      <DashShell
        eyebrow="Photographer"
        title="Your studio"
        subtitle="Services, portfolio and booked shoots in one place."
        nav={NAV}
        footerHref="/"
        footerLabel="Open public site"
      >
        {children}
      </DashShell>
    </AuthGuard>
  );
}