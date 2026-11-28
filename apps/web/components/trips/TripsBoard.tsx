'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ButtonLink, EmptyState, ErrorState, Select, Skeleton } from '@gtour/ui';
import { formatCurrency, getApiErrorMessage, isPaid, isRefunded } from '@gtour/utils';
import type { PaymentDto } from '@gtour/utils';
import CheckoutDialog from '@/components/payment/CheckoutDialog';
import { BookingCard } from '@/components/trips/BookingCard';
import { fetchBookingPayment, fetchMyBookings } from '@/lib/tourist-api';
import type { TouristBookingDto } from '@/lib/tourist-api';
import { bookingDestination, bookingDestinationId } from '@/lib/booking-display';
import type { BookingType } from '@/lib/booking-display';

interface Row {
  booking: TouristBookingDto;
  payment: PaymentDto | null;
}

const ELSEWHERE = 'elsewhere';

const TYPE_FILTERS = ['all', 'hotel', 'photography', 'vehicle'] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: 'All trip types',
  hotel: 'Stays only',
  photography: 'Photoshoots only',
  vehicle: 'Transport only',
};

const WINDOW_FILTERS = ['all', 'upcoming', 'past'] as const;
type WindowFilter = (typeof WINDOW_FILTERS)[number];

const WINDOW_LABELS: Record<WindowFilter, string> = {
  all: 'Any date',
  upcoming: 'Upcoming',
  past: 'Finished',
};

/** A trip is upcoming until its last day has passed. */
function inWindow(booking: TouristBookingDto, window: WindowFilter): boolean {
  if (window === 'all') return true;
  const end = new Date(booking.end_date).getTime();
  if (Number.isNaN(end)) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const past = end < today.getTime();
  return window === 'past' ? past : !past;
}

interface Group {
  key: string;
  destination?: string;
  destinationId?: string;
  rows: Row[];
}

/**
 * Groups bookings by destination first and by trip type second.
 *
 * The product is destination-centric, so a traveller should be able to read
 * "Sundarbans — 1 stay, 1 photoshoot" instead of scrolling one flat ledger.
 * Bookings whose listing carries no destination collect under "Elsewhere"
 * rather than disappearing.
 */
function groupRows(rows: Row[]): Group[] {
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const destinationId = bookingDestinationId(row.booking);
    const destination = bookingDestination(row.booking);
    const key = destinationId ?? (destination ? `name:${destination}` : ELSEWHERE);
    const group = groups.get(key) ?? { key, destination, destinationId, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const order: BookingType[] = ['hotel', 'photography', 'vehicle'];

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(
        (a, b) =>
          new Date(a.booking.start_date).getTime() - new Date(b.booking.start_date).getTime(),
      ),
    }))
    .sort((a, b) => {
      if (a.key === ELSEWHERE) return 1;
      if (b.key === ELSEWHERE) return -1;
      const aCount = new Set(a.rows.map((row) => order.indexOf(row.booking.booking_type))).size;
      const bCount = new Set(b.rows.map((row) => order.indexOf(row.booking.booking_type))).size;
      if (aCount !== bCount) return bCount - aCount;
      return (a.destination ?? '').localeCompare(b.destination ?? '');
    });
}

/**
 * The traveller's trips centre — the page every booking notification links to.
 *
 * Bookings arrive from `/bookings/user`, which returns the whole ledger, so the
 * destination, type and date filters are all applied in the browser.
 */
export default function TripsBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');
  const [checkout, setCheckout] = useState<TouristBookingDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bookings = await fetchMyBookings();
      const withPayments = await Promise.all(
        bookings.map(async (booking) => ({
          booking,
          payment: await fetchBookingPayment(booking._id),
        })),
      );
      setRows(withPayments);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const destinations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const id = bookingDestinationId(row.booking);
      const name = bookingDestination(row.booking);
      if (id && name) seen.set(id, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (typeFilter !== 'all' && row.booking.booking_type !== typeFilter) return false;
        if (!inWindow(row.booking, windowFilter)) return false;
        if (destinationFilter !== 'all') {
          const id = bookingDestinationId(row.booking) ?? ELSEWHERE;
          if (id !== destinationFilter) return false;
        }
        return true;
      }),
    [rows, typeFilter, windowFilter, destinationFilter],
  );

  const groups = useMemo(() => groupRows(filtered), [filtered]);

  const stats = useMemo(() => {
    const upcoming = rows.filter((row) => inWindow(row.booking, 'upcoming'));
    const finished = rows.filter(
      (row) => row.booking.status === 'completed' && inWindow(row.booking, 'past'),
    );
    const unpaid = rows.filter((row) => {
      if (row.booking.status === 'cancelled') return false;
      const status = row.payment?.payment_status;
      return !status || !isPaid(status) || isRefunded(status);
    });
    const value = rows.reduce((sum, row) => sum + (row.booking.total_amount ?? 0), 0);
    const types = new Set(rows.map((row) => row.booking.booking_type));
    return { upcoming: upcoming.length, finished: finished.length, unpaid: unpaid.length, value, types: types.size };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-sea-600">
            Trips centre
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
            Your trips, by destination
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Every stay, photoshoot and vehicle you booked, collected where you booked it. Open a
            destination to add more to the same trip.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/destinations" variant="outline" size="sm">
            Browse destinations
          </ButtonLink>
          <ButtonLink href="/dashboard/payments" variant="ghost" size="sm">
            Payments
          </ButtonLink>
        </div>
      </header>

      <section aria-label="Trip totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Upcoming
          </p>
          <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">
            {stats.upcoming}
          </p>
          <p className="mt-2 text-xs text-ink-500">Still ahead of you</p>
          <span aria-hidden="true" className="mt-3 block h-1 w-10 rounded-pill bg-sea-400" />
        </article>
        <article className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Finished
          </p>
          <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">
            {stats.finished}
          </p>
          <p className="mt-2 text-xs text-ink-500">Completed and reviewed</p>
          <span aria-hidden="true" className="mt-3 block h-1 w-10 rounded-pill bg-ink-300" />
        </article>
        <article className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Awaiting payment
          </p>
          <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">
            {stats.unpaid}
          </p>
          <p className="mt-2 text-xs text-ink-500">Pay from the card below</p>
          <span aria-hidden="true" className="mt-3 block h-1 w-10 rounded-pill bg-coral-400" />
        </article>
        <article className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Trip value
          </p>
          <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">
            {formatCurrency(stats.value)}
          </p>
          <p className="mt-2 text-xs text-ink-500">
            Across {stats.types} trip type{stats.types === 1 ? '' : 's'}
          </p>
          <span aria-hidden="true" className="mt-3 block h-1 w-10 rounded-pill bg-sand-400" />
        </article>
      </section>

      <section
        aria-label="Filters"
        className="rounded-panel border border-ink-100/70 bg-white p-4 shadow-soft"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            aria-label="Filter by trip type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
          >
            {TYPE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by date"
            value={windowFilter}
            onChange={(event) => setWindowFilter(event.target.value as WindowFilter)}
          >
            {WINDOW_FILTERS.map((value) => (
              <option key={value} value={value}>
                {WINDOW_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by destination"
            value={destinationFilter}
            onChange={(event) => setDestinationFilter(event.target.value)}
          >
            <option value="all">All destinations</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
            <option value={ELSEWHERE}>Elsewhere</option>
          </Select>
        </div>
        {!loading && rows.length > 0 ? (
          <p className="mt-3 text-xs text-ink-500">
            Showing {filtered.length} of {rows.length} bookings
            {destinationFilter !== 'all'
              ? ` in ${
                  destinations.find((entry) => entry.id === destinationFilter)?.name ?? 'Elsewhere'
                }`
              : ''}
            .
          </p>
        ) : null}
      </section>

      {error ? (
        <ErrorState
          title="We could not load your trips"
          description={error}
          onRetry={() => void load()}
        />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-panel" />
          <Skeleton className="h-32 w-full rounded-panel" />
          <Skeleton className="h-32 w-full rounded-panel" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No trips yet"
          description="Once a property, photographer or driver accepts your request it lands here, filed under its destination."
          action={
            <ButtonLink href="/destinations" size="sm">
              Find a destination
            </ButtonLink>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description="Try a different trip type, date range or destination."
          action={
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setWindowFilter('all');
                setDestinationFilter('all');
              }}
              className="rounded-pill bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-label={group.destination ?? 'Other bookings'}
              className="space-y-3 scroll-mt-24"
              id={`destination-${group.destinationId ?? ELSEWHERE}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-lg">
                    📍
                  </span>
                  <h2 className="font-display text-lg font-semibold text-ink-900">
                    {group.destination ?? 'Elsewhere in Bangladesh'}
                  </h2>
                  <span className="rounded-pill bg-ink-900/5 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-500">
                    {group.rows.length} booking{group.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {group.destinationId ? (
                  <Link
                    href={`/destinations/${group.destinationId}`}
                    className="text-sm font-semibold text-sea-700 transition-colors hover:text-sea-800"
                  >
                    Explore this destination →
                  </Link>
                ) : null}
              </div>

              <div className="space-y-3">
                {group.rows.map((row) => (
                  <BookingCard
                    key={row.booking._id}
                    booking={row.booking}
                    payment={row.payment}
                    onPay={setCheckout}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {checkout ? (
        <CheckoutDialog
          bookingId={checkout._id}
          bookingReference={checkout.booking_reference}
          onClose={() => {
            setCheckout(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
