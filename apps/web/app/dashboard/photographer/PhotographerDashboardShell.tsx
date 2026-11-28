'use client';

import AuthGuard, { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';
import { usePendingBookingCount } from '@/lib/use-pending-bookings';

/** Shell for the photographer workspace; the API re-checks the role per request. */
export default function PhotographerDashboardShell({ children }: { children: React.ReactNode }) {
  const pending = usePendingBookingCount();
  const nav: DashNavSection[] = [
    {
      title: 'Workspace',
      items: [
        { href: '/dashboard/photographer', label: 'Overview', icon: 'overview', exact: true },
        { href: '/dashboard/photographer#shoots', label: 'Shoots', icon: 'bookings', badge: pending },
        { href: '/dashboard/photographer#portfolio', label: 'Portfolio', icon: 'camera' },
      ],
    },
    {
      title: 'Preview',
      items: [
        { href: '/photographers', label: 'Public photographers', icon: 'compass', external: true },
      ],
    },
  ];

  return (
    <AuthGuard roles={['photographer', 'admin']}>
      <DashShell
        eyebrow="Photographer"
        title="Your studio"
        subtitle="Services, portfolio and booked shoots in one place."
        nav={nav}
        footerHref="/"
        footerLabel="Open public site"
      >
        {children}
      </DashShell>
    </AuthGuard>
  );
}
