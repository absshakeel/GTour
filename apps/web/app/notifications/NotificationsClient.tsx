'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, EmptyState, ErrorState, Select, Skeleton } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { NotificationDto } from '@gtour/utils';
import DashboardShell from '../dashboard/DashboardShell';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import {
  groupByDay,
  notificationMeta,
  notificationRelativeTime,
  notificationTypeOptions,
} from '@/lib/notification-display';

const PAGE_SIZE = 20;

const FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'unread', label: 'Unread only' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

/** Type options come from the shared meta table, so a new enum member shows up here. */
const TYPE_OPTIONS = notificationTypeOptions();

/**
 * Full notification centre behind the bell's "View all" link.
 *
 * The bell only shows the eight newest rows; this page is the searchable
 * archive, so it paginates against the API instead of reusing the stream.
 */
export default function NotificationsClient() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [type, setType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextPage = page, nextFilter = filter, nextType = type) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchNotifications({
          page: nextPage,
          limit: PAGE_SIZE,
          unread: nextFilter === 'unread',
          type: nextType === 'all' ? undefined : nextType,
        });
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
        setPages(data.pagination?.pages ?? 1);
        setTotal(data.pagination?.total ?? 0);
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [page, filter, type],
  );

  useEffect(() => {
    void load(page, filter, type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, type]);

  const markOne = useCallback(
    async (notification: NotificationDto) => {
      if (notification.read_at) return;
      // Optimistic: the row is cheap to revert if the server disagrees.
      setItems((current) =>
        current.map((item) =>
          item._id === notification._id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
      try {
        await markNotificationRead(notification._id);
      } catch {
        void load();
      }
    },
    [load],
  );

  const markEverything = useCallback(async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setUnread(0);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-sea-600">
              Inbox
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">
              Booking requests, payment receipts and account alerts. Emails are sent for every one
              of these as well.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-pill bg-ink-900/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
              {unread} unread
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || unread === 0}
              onClick={() => void markEverything()}
            >
              {busy ? 'Marking…' : 'Mark all as read'}
            </Button>
          </div>
        </header>

        <section
          aria-label="Filters"
          className="grid gap-3 rounded-panel border border-ink-100/70 bg-white p-4 shadow-soft sm:grid-cols-2"
        >
          <Select
            aria-label="Filter by read state"
            value={filter}
            onChange={(event) => {
              setPage(1);
              setFilter(event.target.value as Filter);
            }}
          >
            {FILTERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by notification type"
            value={type}
            onChange={(event) => {
              setPage(1);
              setType(event.target.value);
            }}
          >
            <option value="all">Every kind of update</option>
            {TYPE_OPTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </section>

        {error ? (
          <ErrorState
            title="We could not load your notifications"
            description={error}
            onRetry={() => void load()}
          />
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-panel" />
            <Skeleton className="h-20 w-full rounded-panel" />
            <Skeleton className="h-20 w-full rounded-panel" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'You are all caught up. New booking and payment updates will land here.'
                : 'Booking requests, confirmations and payment receipts will appear here.'
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label} className="space-y-2">
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
                  {group.label}
                </h2>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <NotificationCard
                      key={item._id}
                      notification={item}
                      onOpen={() => void markOne(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {pages > 1 ? (
          <nav
            aria-label="Notification pages"
            className="flex items-center justify-between gap-3 rounded-panel border border-ink-100/70 bg-white p-3 shadow-soft"
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ← Newer
            </Button>
            <span className="text-xs font-medium text-ink-500">
              Page {page} of {pages} · {total} total
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= pages || loading}
              onClick={() => setPage((current) => Math.min(pages, current + 1))}
            >
              Older →
            </Button>
          </nav>
        ) : null}
      </div>
    </DashboardShell>
  );
}

function NotificationCard({
  notification,
  onOpen,
}: {
  notification: NotificationDto;
  onOpen: () => void;
}) {
  const meta = notificationMeta(notification.type);
  const unread = !notification.read_at;

  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sand-50 text-lg"
      >
        {meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-semibold text-ink-900">
            {notification.title}
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${meta.tone}`}
          >
            {meta.label}
          </span>
          {notification.actionable && unread ? (
            <span className="rounded-pill bg-coral-100 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-coral-700">
              Action needed
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-ink-600">{notification.body}</span>
        <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
          {notificationRelativeTime(notification.created_at)}
        </span>
      </span>
      {unread ? (
        <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sea-500" />
      ) : null}
    </>
  );

  const className = `flex gap-3 rounded-panel border p-4 shadow-soft transition-colors ${
    unread ? 'border-sea-200 bg-white' : 'border-ink-100/70 bg-white/70'
  }`;

  return (
    <li>
      {notification.link ? (
        <Link href={notification.link} className={`${className} hover:border-sea-300`} onClick={onOpen}>
          {body}
        </Link>
      ) : (
        <button type="button" className={`${className} w-full text-left`} onClick={onOpen}>
          {body}
        </button>
      )}
    </li>
  );
}
