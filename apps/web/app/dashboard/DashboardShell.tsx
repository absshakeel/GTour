'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@gtour/ui';
import { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';
import { readUser, SESSION_EVENT } from '@gtour/utils';
import type { AuthUserDto } from '@gtour/utils';
import { roleHome, roleLabel } from '@/lib/role-home';

/**
 * Shell for the traveller dashboard. Every signed-in role can open it, because
 * `AuthGuard` uses `/dashboard` as its safe fallback, so the workspace link is
 * added only for the roles that actually own one.
 */
export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);

  useEffect(() => {
    const sync = () => setUser(readUser());
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const role = user?.role;
  const workspaceHref = role && role !== 'tourist' ? roleHome(role) : undefined;
  const workspaceLabel =
    role === 'hotel_owner'
      ? 'Owner dashboard'
      : role === 'photographer'
        ? 'Photographer dashboard'
        : role === 'vehicle_provider'
          ? 'Vehicle dashboard'
          : role === 'admin'
            ? 'Admin console'
            : 'Workspace';

  const nav: DashNavSection[] = [
    {
      title: 'Traveller',
      items: [
        { href: '/dashboard', label: 'Overview', icon: 'overview', exact: true },
        { href: '/dashboard#booking-history', label: 'My bookings', icon: 'bookings' },
      ],
    },
    {
      title: 'Explore',
      items: [
        { href: '/destinations', label: 'Destinations', icon: 'compass' },
        { href: '/hotels', label: 'Stays', icon: 'hotels' },
        { href: '/photographers', label: 'Photographers', icon: 'camera' },
        { href: '/vehicles', label: 'Transport', icon: 'vehicle' },
      ],
    },
    {
      title: 'Account',
      items: [
        { href: '/profile', label: 'Profile', icon: 'profile' },
        ...(workspaceHref
          ? [{ href: workspaceHref, label: workspaceLabel, icon: 'properties' as const }]
          : []),
      ],
    },
  ];

  const firstName = user?.name?.split(/\s+/)[0];

  return (
    <AuthGuard>
      <DashShell
        eyebrow={`${roleLabel(role)} workspace`}
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle="Your bookings, upcoming trips and everything else GTour offers, in one place."
        nav={nav}
        footerHref="/"
        footerLabel="Open public site"
      >
        {children}
      </DashShell>
    </AuthGuard>
  );
}