'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, cn, readUser, SESSION_EVENT } from '@gtour/utils';
import type { AuthUserDto } from '@gtour/utils';

export type DashIcon =
  | 'overview'
  | 'bookings'
  | 'properties'
  | 'rooms'
  | 'calendar'
  | 'wallet'
  | 'profile'
  | 'users'
  | 'map'
  | 'category'
  | 'location'
  | 'hotels'
  | 'camera'
  | 'vehicle'
  | 'reviews'
  | 'compass';

export interface DashNavItem {
  href: string;
  label: string;
  icon: DashIcon;
  badge?: number | string;
  /** Match the path exactly instead of treating it as a prefix. */
  exact?: boolean;
  /** Render an absolutely-positioned external link instead of a `next/link`. */
  external?: boolean;
}

export interface DashNavSection {
  title?: string;
  items: DashNavItem[];
}

export interface DashShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  nav: DashNavSection[];
  /** Call to action rendered at the bottom of the sidebar. */
  footerHref?: string;
  footerLabel?: string;
  children: React.ReactNode;
  contentClassName?: string;
}

const PATH_DEPTH: Record<DashIcon, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M8 3v3.5M16 3v3.5M3 9.5h18M8.5 14h3M8.5 17.5h6" />
    </>
  ),
  properties: (
    <>
      <path d="M3 21h18M5 21V8l7-4.5L19 8v13M9 21v-5.5h6V21" />
    </>
  ),
  rooms: (
    <>
      <path d="M3 18V8M3 12h18M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H12v7" />
      <circle cx="7" cy="9.5" r="1.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M8 3v3.5M16 3v3.5M3 9.5h18" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16.5 14.5h1.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  map: (
    <>
      <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  category: (
    <>
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  hotels: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M7 11h3M14 11h3M7 15h3M14 15h3M9 21v-3.5M15 21v-3.5M7 7V4h10v3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v11H4z" />
      <circle cx="12" cy="14" r="3.2" />
    </>
  ),
  vehicle: (
    <>
      <path d="M4 16.5h16M5.5 16.5V12l1.8-4.2A2 2 0 0 1 9.1 6.5h5.8a2 2 0 0 1 1.8 1.3L18.5 12v4.5" />
      <circle cx="8" cy="18.5" r="1.6" />
      <circle cx="16" cy="18.5" r="1.6" />
    </>
  ),
  reviews: (
    <>
      <path d="M12 3.8l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
};

function NavIcon({ name, active }: { name: DashIcon; active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-sea-300' : 'text-slate-400')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATH_DEPTH[name]}
    </svg>
  );
}

function roleLabel(role?: string): string {
  if (!role) return 'Member';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Sidebar dashboard shell shared by every role.
 *
 * Presentation only — each screen still wraps its content in `AuthGuard` and the
 * API re-checks authorization on every request.
 */
export function DashShell({
  eyebrow,
  title,
  subtitle,
  actions,
  nav,
  footerHref,
  footerLabel,
  children,
  contentClassName,
}: DashShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    setMobileOpen(false);
  }, [pathname]);

  function logout() {
    clearSession();
    router.push('/login');
    router.refresh();
  }

  const isActive = (item: DashNavItem) => {
    if (!pathname) return false;
    if (item.exact || item.href === '/') return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const sidebar = (
    <div className="flex h-full flex-col px-4 py-5 sm:px-5">
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sea-500 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(20,122,128,0.8)]">
          G
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-none text-white">GTour</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.16em] text-sea-200/80">
            {eyebrow}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
            {(user?.name?.[0] || 'G').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.name || 'Signed in'}</p>
            <p className="truncate text-xs text-slate-300">{user?.email || ''}</p>
          </div>
        </div>
        {user?.role ? (
          <p className="mt-2 inline-flex rounded-full bg-sea-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sea-100">
            {roleLabel(user.role)}
          </p>
        ) : null}
      </div>

      <nav aria-label="Dashboard" className="flex-1 space-y-4 overflow-y-auto pb-2">
        {nav.map((section, sectionIndex) => (
          <div key={section.title ?? sectionIndex} className="space-y-1">
            {section.title ? (
              <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {section.title}
              </p>
            ) : null}
            {section.items.map((item) => {
              const active = isActive(item);
              const className = cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-white/12 text-white shadow-[inset_3px_0_0_#2fb7a6]'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              );
              const inner = (
                <>
                  <NavIcon name={item.icon} active={active} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge !== 0 ? (
                    <span className="rounded-full bg-sea-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              );

              if (item.external) {
                return (
                  <a key={`${item.href}-${item.label}`} href={item.href} target="_blank" rel="noreferrer" className={className}>
                    {inner}
                  </a>
                );
              }

              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={className}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-3 space-y-2 border-t border-white/10 pt-4">
        {footerHref && footerLabel ? (
          <a
            href={footerHref}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all hover:bg-white/10 hover:text-white"
          >
            {footerLabel}
          </a>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all hover:border-red-300/40 hover:bg-red-500/10 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100dvh-4.5rem)] bg-[#F3F4F6]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col lg:flex-row">
        <aside className="hidden w-full shrink-0 border-b border-sand-200/80 bg-[#0F2438] lg:sticky lg:top-[4.5rem] lg:block lg:h-[calc(100dvh-4.5rem)] lg:w-[272px] lg:border-b-0 lg:border-r lg:border-[#1b3550]">
          {sidebar}
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            />
            <div className="absolute inset-y-0 left-0 w-[280px] max-w-[82vw] overflow-y-auto bg-[#0F2438] shadow-panel">
              {sidebar}
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 border-b border-sand-200 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sea-700">
                  {eyebrow}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{subtitle}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open navigation"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-800 lg:hidden"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className={contentClassName}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default DashShell;