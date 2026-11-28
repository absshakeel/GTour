'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@gtour/utils';
import type { NotificationDto } from '@gtour/utils';
import { notificationMeta, notificationRelativeTime } from '@/lib/notification-display';
import { useLiveNotifications } from '@/lib/use-live-notifications';

/**
 * The header bell.
 *
 * Renders its own state rather than taking it as props, because the stream must
 * stay open for the whole session — a parent re-mount would drop and re-open the
 * connection every time the page changed.
 */

export interface NotificationBellProps {
  /** Only render and connect while a session exists. */
  enabled: boolean;
}

export function NotificationBell({ enabled }: NotificationBellProps) {
  const { unread, items, connected, soundEnabled, toggleSound, markRead, markAllRead } =
    useLiveNotifications(enabled);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!enabled) return null;

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={connected ? undefined : 'Reconnecting…'}
        className={cn(
          'relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50',
          open
            ? 'border-sea-300 bg-white shadow-soft text-ink-900'
            : 'border-sand-300/80 bg-white/80 text-ink-700 hover:border-sea-300 hover:bg-white',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8.5a6 6 0 1 0-12 0c0 4.5-1.6 5.8-2.2 6.4a.9.9 0 0 0 .6 1.6h15.2a.9.9 0 0 0 .6-1.6c-.6-.6-2.2-1.9-2.2-6.4Z" />
          <path d="M10 20a2.2 2.2 0 0 0 4 0" />
        </svg>

        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta-500 px-1 text-[10px] font-bold text-white ring-2 ring-sand-50">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[22rem] origin-top-right overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-[0_28px_70px_-28px_rgba(12,28,44,0.4)] sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-sand-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">Notifications</p>
              <p className="text-xs text-ink-500">
                {connected ? 'Live' : 'Reconnecting…'}
                {unread > 0 ? ` · ${unread} unread` : ' · all caught up'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'Mute notification sound' : 'Unmute notification sound'}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea-400',
                soundEnabled
                  ? 'border-sea-200 bg-sea-50 text-sea-700'
                  : 'border-sand-300 bg-white text-ink-400',
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M11 5 6.5 9H3.8a.8.8 0 0 0-.8.8v4.4a.8.8 0 0 0 .8.8h2.7L11 19V5Z" />
                {soundEnabled ? (
                  <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
                ) : (
                  <path d="M16 9.5 21 15M21 9.5 16 15" />
                )}
              </svg>
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink-700">Nothing here yet</p>
                <p className="mt-1 text-xs text-ink-500">
                  Booking, payment and account updates will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-sand-200">
                {items.map((notification) => (
                  <NotificationRow
                    key={notification._id}
                    notification={notification}
                    onRead={() => void markRead(notification._id)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-sand-200 bg-sand-50/60 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-sea-700 hover:text-sea-800"
            >
              View all
            </Link>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
              className="text-xs font-semibold text-ink-500 transition-colors hover:text-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  notification,
  onRead,
  onNavigate,
}: {
  notification: NotificationDto;
  onRead: () => void;
  onNavigate: () => void;
}) {
  const close = onNavigate;
  const meta = notificationMeta(notification.type);
  const unread = !notification.read_at;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            meta.tone,
          )}
        >
          {meta.label}
        </span>
        <span className="shrink-0 text-[11px] text-ink-400">
          {notificationRelativeTime(notification.created_at)}
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-sm',
          unread ? 'font-semibold text-ink-900' : 'font-medium text-ink-700',
        )}
      >
        {notification.title}
      </p>
      <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-ink-500">
        {notification.body}
      </p>
    </>
  );

  const className = cn(
    'block px-4 py-3 transition-colors hover:bg-sand-50',
    unread && 'bg-sea-50/40',
  );

  const open = () => {
    onRead();
    close();
  };

  // Marking read happens on open, not on render: the badge should only drop when
  // the traveller actually looked at the item.
  return (
    <li>
      {notification.link ? (
        <Link href={notification.link} onClick={open} className={className}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={open} className={cn(className, 'w-full text-left')}>
          {body}
        </button>
      )}
    </li>
  );
}
