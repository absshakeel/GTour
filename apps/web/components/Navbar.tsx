'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@gtour/ui';
import { SESSION_EVENT, clearSession, cn, readUser } from '@gtour/utils';
import type { AuthUserDto } from '@gtour/utils';
import { isCrossOrigin, roleHome, roleLabel } from '@/lib/role-home';

const NAV_LINKS = [
  { href: '/destinations', label: 'Explore' },
  { href: '/hotels', label: 'Hotels' },
  { href: '/photographers', label: 'Photographers' },
  { href: '/vehicles', label: 'Vehicles' },
] as const;

const ICONS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  building: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M8 3v3.5M16 3v3.5M3 9.5h18" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2h7l1.5 2h3a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
      <circle cx="12" cy="13.5" r="3" />
    </>
  ),
  car: (
    <>
      <path d="M5 17h14M4 17v-4l2-5h12l2 5v4" />
      <circle cx="7.5" cy="17.5" r="1.6" />
      <circle cx="16.5" cy="17.5" r="1.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  chevron: <path d="M5 7.5l5 5 5-5" />,
} as const;

function Icon({ path, className }: { path: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px] shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[path]}
    </svg>
  );
}

interface AccountLink {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  description?: string;
}

/**
 * Workspace links for the signed-in role. Every role gets exactly one dashboard
 * entry; hotel owners additionally get a shortcut to their booking queue.
 */
function workspaceLinks(role?: string): AccountLink[] {
  if (!role) return [];

  if (role === 'hotel_owner') {
    return [
      {
        href: '/dashboard/owner',
        label: 'Owner dashboard',
        icon: 'building',
        description: 'Properties and rooms',
      },
      {
        href: '/dashboard/owner/bookings',
        label: 'Booking requests',
        icon: 'calendar',
        description: 'Confirm or decline stays',
      },
    ];
  }
  if (role === 'photographer') {
    return [
      {
        href: '/dashboard/photographer',
        label: 'Photographer dashboard',
        icon: 'camera',
        description: 'Services and shoots',
      },
    ];
  }
  if (role === 'vehicle_provider') {
    return [
      {
        href: '/dashboard/vehicles',
        label: 'Vehicle dashboard',
        icon: 'car',
        description: 'Fleet and trips',
      },
    ];
  }
  if (role === 'admin') {
    return [
      { href: roleHome('admin'), label: 'Admin console', icon: 'grid', description: 'Platform management' },
    ];
  }
  return [{ href: '/dashboard', label: 'My dashboard', icon: 'grid', description: 'Bookings and trips' }];
}

function MenuLink({ item, onNavigate }: { item: AccountLink; onNavigate: () => void }) {
  const content = (
    <>
      <Icon path={item.icon} className="text-ink-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{item.label}</span>
        {item.description ? (
          <span className="block truncate text-xs text-ink-500">{item.description}</span>
        ) : null}
      </span>
    </>
  );
  const className =
    'flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-sand-100 focus-visible:bg-sand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea-400';

  if (isCrossOrigin(item.href)) {
    return (
      <a href={item.href} role="menuitem" className={className} onClick={onNavigate}>
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} role="menuitem" className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    setMenuOpen(false);
    setUserMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  const displayName = user?.name?.trim() || 'Account';
  const firstName = displayName.split(/\s+/)[0];
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const links = workspaceLinks(user?.role);
  const closeMenu = () => setUserMenuOpen(false);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-premium',
        scrolled
          ? 'border-b border-ink-100/70 bg-sand-50/90 shadow-soft backdrop-blur-md'
          : 'border-b border-transparent bg-sand-50/70 backdrop-blur-sm'
      )}
    >
      <nav aria-label="Main" className="gtour-container">
        <div className="flex h-18 items-center justify-between gap-4">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-pill py-2 text-ink-900"
            aria-label="GTour home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sea-500 text-white transition-transform duration-300 ease-premium group-hover:scale-105">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.5a15.9 15.9 0 00-1.2-3.1A8 8 0 0118.9 8zM12 4.2c.6.9 1.2 2 1.6 3.8H10.4c.4-1.8 1-2.9 1.6-3.8zM4.3 14a7.9 7.9 0 010-4h2.9a19.4 19.4 0 000 4zm.8 2h2.5c.3 1.1.7 2.2 1.2 3.1A8 8 0 015.1 16zm2.5-8H5.1a8 8 0 013.7-3.1A15.9 15.9 0 007.6 8zM12 19.8c-.6-.9-1.2-2-1.6-3.8h3.2c-.4 1.8-1 2.9-1.6 3.8zm1.9-5.8H10.1a17.4 17.4 0 010-4h3.8a17.4 17.4 0 010 4zm.6 5.1c.5-.9.9-2 1.2-3.1h2.5a8 8 0 01-3.7 3.1zm1.7-5.1a19.4 19.4 0 000-4h2.9a7.9 7.9 0 010 4z" />
              </svg>
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">GTour</span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-pill px-4 py-2 text-sm font-medium transition-colors duration-200',
                      active
                        ? 'bg-sea-100 text-sea-700'
                        : 'text-ink-600 hover:bg-sand-200/70 hover:text-ink-900'
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            {!user ? (
              <li>
                <Link
                  href="/register?role=provider"
                  className="rounded-pill px-4 py-2 text-sm font-medium text-ink-600 transition-colors duration-200 hover:bg-sand-200/70 hover:text-ink-900"
                >
                  Become a Provider
                </Link>
              </li>
            ) : null}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={`Account menu for ${displayName}`}
                  className={cn(
                    'flex items-center gap-2.5 rounded-pill border py-1.5 pl-1.5 pr-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50',
                    userMenuOpen
                      ? 'border-sea-300 bg-white shadow-soft'
                      : 'border-sand-300/80 bg-white/80 text-ink-800 hover:border-sea-300 hover:bg-white'
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sea-500 text-[11px] font-bold tracking-wide text-white">
                    {initials}
                  </span>
                  <span className="max-w-[8rem] truncate text-ink-900">{firstName}</span>
                  <Icon
                    path="chevron"
                    className={cn(
                      'h-4 w-4 text-ink-400 transition-transform duration-200',
                      userMenuOpen && 'rotate-180'
                    )}
                  />
                </button>

                {userMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Account"
                    className="absolute right-0 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-sand-200/90 bg-white p-2 shadow-[0_28px_70px_-28px_rgba(12,28,44,0.4)]"
                  >
                    <div className="flex items-center gap-3 rounded-xl bg-sand-50 p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sea-500 text-xs font-bold text-white">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
                        <p className="truncate text-xs text-ink-500">{user.email}</p>
                      </div>
                    </div>
                    <p className="mt-2 px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
                      {roleLabel(user.role)}
                    </p>

                    <div className="space-y-0.5">
                      {links.map((item) => (
                        <MenuLink key={`${item.href}-${item.label}`} item={item} onNavigate={closeMenu} />
                      ))}
                    </div>

                    <div className="my-2 h-px bg-sand-200" />
                    <MenuLink
                      item={{
                        href: '/profile',
                        label: 'Profile settings',
                        icon: 'user',
                        description: 'Name, photo and preferences',
                      }}
                      onNavigate={closeMenu}
                    />

                    <div className="my-2 h-px bg-sand-200" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-terracotta-700 transition-colors hover:bg-terracotta-50 focus-visible:bg-terracotta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-300"
                    >
                      <Icon path="logout" className="text-terracotta-500" />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Login
                </ButtonLink>
                <ButtonLink href="/register" variant="primary" size="sm">
                  Get Started
                </ButtonLink>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-white/80 text-ink-800 transition-colors hover:border-sea-400 lg:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5 stroke-current"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id="mobile-nav"
          className="border-t border-ink-100 bg-sand-50/95 shadow-lift backdrop-blur-md lg:hidden"
        >
          <ul className="gtour-container flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-200"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {!user ? (
              <li>
                <Link
                  href="/register?role=provider"
                  className="block rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-200"
                >
                  Become a Provider
                </Link>
              </li>
            ) : null}

            {user ? (
              <>
                <li className="mt-2 flex items-center gap-3 rounded-2xl bg-sand-100/70 px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sea-500 text-xs font-bold text-white">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                  </div>
                </li>
                {links.map((item) => (
                  <li key={`m-${item.href}-${item.label}`}>
                    {isCrossOrigin(item.href) ? (
                      <a
                        href={item.href}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-200"
                      >
                        <Icon path={item.icon} className="text-ink-400" />
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-200"
                      >
                        <Icon path={item.icon} className="text-ink-400" />
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
                <li>
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-200"
                  >
                    <Icon path="user" className="text-ink-400" />
                    Profile settings
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-terracotta-700 transition-colors hover:bg-terracotta-50"
                  >
                    <Icon path="logout" className="text-terracotta-500" />
                    Sign out
                  </button>
                </li>
              </>
            ) : (
              <li className="mt-2 flex gap-3 px-1">
                <ButtonLink href="/login" variant="outline" size="md" className="flex-1">
                  Login
                </ButtonLink>
                <ButtonLink href="/register" variant="primary" size="md" className="flex-1">
                  Get Started
                </ButtonLink>
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </header>
  );
}