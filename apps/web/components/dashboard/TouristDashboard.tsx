'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@gtour/ui';
import { formatCurrency, getApiErrorMessage, readUser } from '@gtour/utils';
import type { AuthUserDto, BookingStatusValue } from '@gtour/utils';
import { fetchBookingPayment, fetchMyBookings } from '@/lib/tourist-api';
import type { PaymentDto, TouristBookingDto } from '@/lib/tourist-api';
import CheckoutDialog from '@/components/payment/CheckoutDialog';
import { BookingCard } from '@/components/trips/BookingCard';
import { formatDate } from '@/lib/booking-status';
import { bookingCopy, bookingDestination, bookingDestinationId } from '@/lib/booking-display';
import type { BookingType } from '@/lib/booking-display';

type Filter = 'all' | BookingStatusValue;
type TypeFilter = 'all' | BookingType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'hotel', label: 'Stays' },
  { value: 'photography', label: 'Photoshoots' },
  { value: 'vehicle', label: 'Transport' },
];

const EXPLORE = [
  { href: '/destinations', title: 'Destinations', desc: 'Places worth the journey.' },
  { href: '/hotels', title: 'Stays', desc: 'Hotels and rooms island-wide.' },
  { href: '/photographers', title: 'Photographers', desc: 'Book a shoot on location.' },
  { href: '/vehicles', title: 'Transport', desc: 'Vehicles with a driver.' },
];

function isUpcoming(booking: TouristBookingDto): boolean {
  if (booking.status === 'cancelled' || booking.status === 'completed') return false;
  const end = new Date(booking.end_date).getTime();
  return Number.isFinite(end) ? end >= Date.now() : false;
}

/**
 * Groups a booking list by type so the history reads as separate ledgers rather
 * than one undifferentiated pile of rows.
 */
function groupByType(bookings: TouristBookingDto[]): { type: BookingType; rows: TouristBookingDto[] }[] {
  const order: BookingType[] = ['hotel', 'photography', 'vehicle'];
  return order
    .map((type) => ({ type, rows: bookings.filter((row) => row.booking_type === type) }))
    .filter((group) => group.rows.length > 0);
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">{value}</p>
      <p className="mt-2 text-xs text-ink-500">{hint}</p>
      <span aria-hidden="true" className={`mt-3 block h-1 w-10 rounded-pill ${tone}`} />
    </div>
  );
}

/** Traveller home: booking stats, upcoming trips, full history and account summary. */
export default function TouristDashboard() {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [bookings, setBookings] = useState<TouristBookingDto[]>([]);
  const [payments, setPayments] = useState<Record<string, PaymentDto | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');
  const [checkout, setCheckout] = useState<TouristBookingDto | null>(null);

  useEffect(() => setUser(readUser()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMyBookings();
      setBookings(rows);

      // Payment rows are read per booking; cap the fan-out so a long history
      // does not fire dozens of requests at once. Pending requests are included
      // because `pay_on_request` properties collect before the owner reviews.
      const withPayment = rows.slice(0, 20);
      const entries = await Promise.all(
        withPayment.map(async (row) => [row._id, await fetchBookingPayment(row._id)] as const),
      );
      setPayments(Object.fromEntries(entries));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const upcoming = bookings
      .filter(isUpcoming)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const completed = bookings.filter((row) => row.status === 'completed');
    const spend = bookings
      .filter((row) => row.status === 'confirmed' || row.status === 'completed')
      .reduce((sum, row) => sum + (row.total_amount ?? 0), 0);

    return { upcoming, completed, spend };
  }, [bookings]);

  /**
   * Bookings narrowed to one destination. Everything downstream — the type
   * counts, the status counts and the ledgers — reads through it so the
   * destination chip behaves like a real scope and not just a visual filter.
   */
  const inDestination = useMemo(() => {
    if (destinationFilter === 'all') return bookings;
    return bookings.filter(
      (row) => (bookingDestinationId(row) ?? 'elsewhere') === destinationFilter,
    );
  }, [bookings, destinationFilter]);

  /** How many of each type the traveller holds, so the tiles describe the mix. */
  const mix = useMemo(
    () =>
      (['hotel', 'photography', 'vehicle'] as BookingType[]).map((type) => ({
        type,
        count: inDestination.filter((row) => row.booking_type === type).length,
      })),
    [inDestination],
  );

  const visible = useMemo(() => {
    const byStatus =
      filter === 'all' ? inDestination : inDestination.filter((row) => row.status === filter);
    return typeFilter === 'all'
      ? byStatus
      : byStatus.filter((row) => row.booking_type === typeFilter);
  }, [inDestination, filter, typeFilter]);

  /** The history split into one ledger per booking type. */
  const groups = useMemo(() => groupByType(visible), [visible]);

  /**
   * The next place the traveller is actually going. Surfaced above the lists so
   * the dashboard reads destination-first rather than hotel-first.
   */
  const focusDestination = useMemo(() => {
    const next = [...stats.upcoming].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
    )[0];
    if (!next) return null;

    const name = bookingDestination(next);
    if (!name) return null;

    return { name, id: bookingDestinationId(next), startDate: next.start_date };
  }, [stats.upcoming]);

  /**
   * Every booking rolled up by destination, so the dashboard answers "where am
   * I going?" before "what did I book?". Bookings whose listing carries no
   * destination are collected under a single "Elsewhere" entry.
   */
  const byDestination = useMemo(() => {
    const order: BookingType[] = ['hotel', 'photography', 'vehicle'];
    const grouped = new Map<
      string,
      { id?: string; name: string; counts: Record<BookingType, number>; total: number }
    >();

    for (const booking of bookings) {
      const name = bookingDestination(booking) ?? 'Elsewhere';
      const id = bookingDestinationId(booking);
      const key = id ?? name;
      const entry =
        grouped.get(key) ??
        { id, name, counts: { hotel: 0, photography: 0, vehicle: 0 }, total: 0 };
      entry.counts[booking.booking_type] += 1;
      entry.total += 1;
      grouped.set(key, entry);
    }

    return [...grouped.values()]
      .map((entry) => ({
        ...entry,
        summary: order
          .filter((type) => entry.counts[type] > 0)
          .map((type) => {
            const copy = bookingCopy(type);
            const label = entry.counts[type] === 1 ? copy.noun : copy.plural;
            return `${entry.counts[type]} ${label.toLowerCase()}`;
          })
          .join(' · '),
      }))
      .sort((a, b) => b.total - a.total);
  }, [bookings]);

  return (
    <div className="space-y-8">
      {focusDestination ? (
        <section
          aria-label="Your focus destination"
          className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-sea-200 bg-sea-100/60 p-5"
        >
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-700">
              Focus destination
            </p>
            <p className="mt-1 truncate font-display text-xl font-semibold text-ink-900">
              {focusDestination.name}
            </p>
            <p className="mt-0.5 text-sm text-ink-600">
              Your next booking starts {formatDate(focusDestination.startDate)}.
            </p>
          </div>
          {focusDestination.id ? (
            <ButtonLink href={`/destinations/${focusDestination.id}`} size="sm" variant="outline">
              Explore {focusDestination.name}
            </ButtonLink>
          ) : null}
        </section>
      ) : null}

      {byDestination.length > 1 ? (
        <section aria-label="Your destinations">
          <div className="mb-3">
            <h2 className="font-display text-lg font-semibold text-ink-900">Your destinations</h2>
            <p className="text-sm text-ink-500">
              Every booking grouped by where it happens, across stays, photoshoots and transport.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {byDestination.map((entry) => {
              const body = (
                <>
                  <p className="truncate font-display text-base font-semibold text-ink-900">
                    {entry.name}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">{entry.summary}</p>
                </>
              );

              return (
                <li key={entry.id ?? entry.name}>
                  {entry.id ? (
                    <Link
                      href={`/destinations/${entry.id}`}
                      className="block rounded-panel border border-ink-100/80 bg-white p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-sea-300"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="rounded-panel border border-dashed border-ink-200 bg-sand-50/60 p-4">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stays"
          value={String(mix.find((row) => row.type === 'hotel')?.count ?? 0)}
          hint="Hotels and rooms you have booked"
          tone="bg-sea-500"
        />
        <StatCard
          label="Photoshoots"
          value={String(mix.find((row) => row.type === 'photography')?.count ?? 0)}
          hint="Photo sessions with a local photographer"
          tone="bg-gold-400"
        />
        <StatCard
          label="Transport"
          value={String(mix.find((row) => row.type === 'vehicle')?.count ?? 0)}
          hint="Vehicles you have rented with a driver"
          tone="bg-ink-500"
        />
        <StatCard
          label="Spend"
          value={formatCurrency(stats.spend) ?? '৳0'}
          hint="Confirmed and completed bookings, in BDT"
          tone="bg-terracotta-500"
        />
      </section>

      <section aria-label="Upcoming trips">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Upcoming trips</h2>
            <p className="text-sm text-ink-500">
              {stats.upcoming.length > 0
                ? `${stats.upcoming.length} booking${stats.upcoming.length === 1 ? '' : 's'} still ahead of you.`
                : 'Everything you have booked, in one place.'}
            </p>
          </div>
          <ButtonLink href="/hotels" size="sm" variant="outline">
            Book something new
          </ButtonLink>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full rounded-panel" />
            <Skeleton className="h-36 w-full rounded-panel" />
          </div>
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : stats.upcoming.length === 0 ? (
          <EmptyState
            title="No trips lined up"
            description="Book a stay, a photoshoot or transport and it appears here with its confirmation status."
            action={<ButtonLink href="/hotels">Find a stay</ButtonLink>}
            compact
          />
        ) : (
          <div className="space-y-3">
            {stats.upcoming.slice(0, 3).map((booking) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                payment={payments[booking._id]}
                onPay={setCheckout}
              />
            ))}
          </div>
        )}
      </section>

      <section id="booking-history" aria-label="Booking history" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Booking history</h2>
            <p className="text-sm text-ink-500">
              Each kind of booking keeps its own ledger below. Filter by destination, status or by
              what you booked.
            </p>
          </div>
        </div>

        <div className="mb-4 space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by booking type">
            {TYPE_FILTERS.map((option) => {
              const count =
                option.value === 'all'
                  ? inDestination.length
                  : (mix.find((row) => row.type === option.value)?.count ?? 0);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={typeFilter === option.value}
                  onClick={() => setTypeFilter(option.value)}
                  className={
                    typeFilter === option.value
                      ? 'rounded-pill bg-sea-700 px-3.5 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-pill border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:border-sea-300 hover:bg-sea-50'
                  }
                >
                  {option.label}
                  <span className="ml-1.5 text-[10px] font-medium opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={
                  filter === option.value
                    ? 'rounded-pill bg-ink-900 px-3.5 py-1.5 text-xs font-semibold text-sand-50'
                    : 'rounded-pill border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:border-sea-300 hover:bg-sea-50'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          {byDestination.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by destination">
              <button
                type="button"
                aria-pressed={destinationFilter === 'all'}
                onClick={() => setDestinationFilter('all')}
                className={
                  destinationFilter === 'all'
                    ? 'rounded-pill bg-terracotta-500 px-3.5 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-pill border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50'
                }
              >
                Everywhere
              </button>
              {byDestination.map((entry) => {
                const value = entry.id ?? 'elsewhere';
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={destinationFilter === value}
                    onClick={() => setDestinationFilter(value)}
                    className={
                      destinationFilter === value
                        ? 'rounded-pill bg-terracotta-500 px-3.5 py-1.5 text-xs font-semibold text-white'
                        : 'rounded-pill border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50'
                    }
                  >
                    {entry.name}
                    <span className="ml-1.5 text-[10px] font-medium opacity-70">{entry.total}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
          </div>
        ) : error ? null : groups.length === 0 ? (
          <EmptyState
            title={filter === 'all' && typeFilter === 'all' ? 'No bookings yet' : 'Nothing matches those filters'}
            description={
              filter === 'all' && typeFilter === 'all'
                ? 'Book a stay, a photoshoot or transport and your bookings will appear here.'
                : 'Try a different status or booking type to see your other bookings.'
            }
            compact
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.type}>
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 pb-2">
                  <h3 className="font-display text-base font-semibold text-ink-900">
                    {bookingCopy(group.type).plural}
                    <span className="ml-2 text-sm font-normal text-ink-400">
                      {group.rows.length} booking{group.rows.length === 1 ? '' : 's'}
                    </span>
                  </h3>
                  <ButtonLink
                    href={bookingCopy(group.type).catalogue}
                    size="sm"
                    variant="ghost"
                  >
                    Book another
                  </ButtonLink>
                </div>
                <div className="space-y-3">
                  {group.rows.map((booking) => (
                    <BookingCard
                      key={booking._id}
                      booking={booking}
                      payment={payments[booking._id]}
                      onPay={setCheckout}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Account and exploration" className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Keep exploring</h2>
          <p className="mt-1 text-sm text-ink-500">
            Everything on GTour for your next trip across Bangladesh.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {EXPLORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-ink-100/80 bg-sand-50/60 p-4 transition-all hover:-translate-y-0.5 hover:border-sea-300 hover:bg-white"
              >
                <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-ink-500">{item.desc}</p>
                <span className="mt-2 inline-flex text-xs font-semibold text-sea-700 group-hover:text-sea-800">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Your account
          </p>
          <p className="mt-2 font-display text-lg font-semibold text-ink-900">
            {user?.name || 'Traveller'}
          </p>
          <p className="truncate text-sm text-ink-500">{user?.email || ''}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-400">Role</dt>
              <dd className="font-medium capitalize text-ink-800">
                {user?.role?.replace('_', ' ') || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-400">Status</dt>
              <dd className="font-medium capitalize text-sea-700">{user?.account_status || '—'}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2">
            <ButtonLink href="/profile" size="sm" variant="outline" className="w-full">
              Edit profile
            </ButtonLink>
            {user?.role === 'hotel_owner' || user?.role === 'admin' ? (
              <ButtonLink href="/dashboard/owner" size="sm" className="w-full">
                Manage properties
              </ButtonLink>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh bookings'}
          </Button>
        </div>
      </section>

      {checkout ? (
        <CheckoutDialog
          bookingId={checkout._id}
          bookingReference={checkout.booking_reference}
          onClose={() => setCheckout(null)}
        />
      ) : null}
    </div>
  );
}
