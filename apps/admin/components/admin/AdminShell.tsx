'use client';

import { DashShell } from '@gtour/ui';
import type { DashNavSection } from '@gtour/ui';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';

const NAV: DashNavSection[] = [
  {
    title: 'Console',
    items: [
      { href: '/', label: 'Overview', icon: 'overview', exact: true },
      { href: '/users', label: 'Users', icon: 'users' },
      { href: '/hotels', label: 'Hotels', icon: 'hotels' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/destinations', label: 'Destinations', icon: 'map' },
      { href: '/categories', label: 'Categories', icon: 'category' },
      { href: '/locations', label: 'Locations', icon: 'location' },
    ],
  },
  {
    title: 'Account',
    items: [{ href: '/profile', label: 'Profile', icon: 'profile' }],
  },
];

export default function AdminShell({
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
  return (
    <DashShell
      eyebrow="Administration"
      title={title}
      subtitle={subtitle}
      actions={actions}
      nav={NAV}
      footerHref={WEB_URL}
      footerLabel="Open public site"
    >
      {children}
    </DashShell>
  );
}
