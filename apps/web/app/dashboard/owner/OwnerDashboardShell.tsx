'use client';

import AuthGuard from '@gtour/ui';
import { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';
import { usePendingBookingCount } from '@/lib/use-pending-bookings';

/**
 * Shell for every hotel-owner screen. Access is limited to `hotel_owner` and
 * `admin`; the API re-checks the same roles on every request it receives.
 */
export default function OwnerDashboardShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pending = usePendingBookingCount();
  const nav: DashNavSection[] = [
    {
      title: 'Manage',
      items: [
        { href: '/dashboard/owner', label: 'Properties', icon: 'properties', exact: true },
        { href: '/dashboard/owner/bookings', label: 'Bookings', icon: 'bookings', badge: pending },
        { href: '/dashboard/owner/payments', label: 'Payments', icon: 'wallet' },
      ],
    },
    {
      title: 'Preview',
      items: [{ href: '/hotels', label: 'Public hotel list', icon: 'compass', external: true }],
    },
  ];

  return (
    <AuthGuard roles={['hotel_owner', 'admin']}>
      <DashShell
        eyebrow="Hotel owner"
        title={title}
        subtitle={subtitle}
        actions={actions}
        nav={nav}
        footerHref="/"
        footerLabel="Open public site"
      >
        {children}
      </DashShell>
    </AuthGuard>
  );
}
