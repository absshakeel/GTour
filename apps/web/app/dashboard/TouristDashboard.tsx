'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@gtour/ui';
import { getApiErrorMessage, readUser, refName } from '@gtour/utils';
import type { AuthUserDto, BookingStatusValue } from '@gtour/utils';
import { fetchBookingPayment, fetchMyBookings } from '@/lib/tourist-api';
import type { PaymentDto, TouristBookingDto } from '@/lib/tourist-api';
import { BOOKING_STATUS_TONES, bookingStatusLabel, formatDate, stayNights } from '@/lib/booking-status';
import { formatCurrency } from '@/lib/format';

type Filter = 'all' | BookingStatusValue;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EXPLORE = [
  { href: '/destinations', title: 'Destinations', desc: 'Places worth the journey.' },
  { href: '/hotels', title: 'Stays', desc: 'Hotels and rooms island-wide.' },
  { href: '/photographers', title: 'Photographers', desc: 'Book a shoot on location.' },
  { href: '/vehicles', title: 'Transport', desc: 'Vehicles with a driver.' },
];

function hotelName(booking: TouristBookingDto): string {
  const hotel = booking.hotel_id;
  if (hotel && typeof hotel === 'object' && hotel.name) return hotel.name;
  return 'Hotel stay';
}

function hotelCover(booking: TouristBookingDto): string | undefined {
  const hotel = booking.hotel_id;
  if (hotel && typeof hotel === 'object') return hotel.images?.[0];
  return undefined;
}

/** Destination of the booked stay. Everything on GTour is organised by place. */
function bookingDestination(booking: TouristBookingDto): string | undefined {
  const hotel = booking.hotel_id;
  if (!hotel || typeof hotel !== 'object') return undefined;
  return refName(hotel.destination_id);
}

function bookingDestinationId(booking: TouristBookingDto): string | undefined {
  const hotel = booking.hotel_id;
  if (!hotel || typeof hotel !== 'object') return undefined;
  const destination = hotel.destination_id;
  if (destination && typeof destination === 'object') return destination._id;
  return typeof destination === 'string' ? destination : undefined;
}

function roomLabel(booking: TouristBookingDto): string | undefined {
  const room = booking.hotel_room_id;
  if (room && typeof room === 'object') return room.room_type;
  return undefined;
}

function isUpcoming(booking: TouristBookingDto): boolean {
  if (booking.status === 'cancelled' || booking.status === 'completed') return false;
  const end = new Date(booking.end_date).getTime();
  return Number.isFinite(end) ? end >= Date.now() : false;
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
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">{value}</p>
      <p className="mt-2 text-xs text-ink-500">{hint}</p>
      <span aria-hidden="true" className={`mt-3 block h-1 w-10 rounded-pill ${tone}`} />
    </div>
  );
}

function BookingCard({
  booking,
  payment,
}: {
  booking: TouristBookingDto;
  payment?: PaymentDto | null;
}) {
  const cover = hotelCover(booking);
  const nights = stayNights(booking.start_date, booking.end_date);
  const room = roomLabel(booking);
  const snapshot = booking.price_snapshot;
  const destination = bookingDestination(booking);
  const destinationId = bookingDestinationId(booking);

  return (
    <article className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-2xl bg-sand-100 sm:h-24 sm:w-32">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={hotelName(booking)} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-ink-400">
              No photo
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {destination ? (
                destinationId ? (
                  <Link
                    href={`/destinations/${destinationId}`}
                    className="mb-1 inline-flex items-center gap-1 rounded-pill bg-sea-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sea-700 transition-colors hover:bg-sea-200"
                  >
                    <span aria-hidden="true">📍</span>
                    {destination}
                  </Link>
                ) : (
                  <p className="mb-1 inline-flex items-center gap-1 rounded-pill bg-sea-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sea-700">
                    {destination}
                  </p>
                )
              ) : null}
              <h3 className="truncate font-display text-lg font-semibold text-ink-900">
                {hotelName(booking)}
              </h3>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-ink-400">
                {booking.booking_reference}
              </p>
            </div>
            <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
              {bookingStatusLabel(booking.status)}
            </Badge>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex gap-1.5">
              <dt className="text-ink-400">In</dt>
              <dd className="font-medium text-ink-800">{formatDate(booking.start_date)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">Out</dt>
              <dd className="font-medium text-ink-800">{formatDate(booking.end_date)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">Stay</dt>
              <dd className="font-medium text-ink-800">
                {nights} night{nights === 1 ? '' : 's'} · {booking.room_count} room
                {booking.room_count === 1 ? '' : 's'}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">Guests</dt>
              <dd className="font-medium text-ink-800">{booking.guest_count}</dd>
            </div>
            {room ? (
              <div className="flex gap-1.5">
                <dt className="text-ink-400">Room</dt>
                <dd className="truncate font-medium text-ink-800">{room}</dd>
              </div>
            ) : null}
            {payment ? (
              <div className="flex gap-1.5">
                <dt className="text-ink-400">Payment</dt>
                <dd className="font-medium capitalize text-ink-800">
                  {payment.payment_status.replace(/_/g, ' ')}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="font-display text-xl font-semibold text-ink-900">
            {formatCurrency(booking.total_amount)}
          </p>
          {snapshot ? (
            <p className="mt-0.5 text-[11px] text-ink-400">
              {formatCurrency(snapshot.price_per_night, snapshot.currency)}/night
            </p>
          ) : null}
          {booking.status === 'pending' ? (
            <p className="mt-2 text-[11px] font-medium text-gold-600">Awaiting hotel approval</p>
          ) : null}
        </div>
      </div>
    </article>
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

  useEffect(() => setUser(readUser()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMyBookings();
      setBookings(rows);

      // Payment rows are read per booking; cap the fan-out so a long history
      // does not fire dozens of requests at once.
      const withPayment = rows.filter((row) => row.status !== 'pending').slice(0, 10);
      const entries = await Promise.all(
        withPayment.map(async (row) => [row._id, await fetchBookingPayment(row._id)] as const)
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
    const upcoming = bookings.filter(isUpcoming);
    const completed = bookings.filter((row) => row.status === 'completed');
    const spend = bookings
      .filter((row) => row.status === 'confirmed' || row.status === 'completed')
      .reduce((sum, row) => sum + (row.total_amount ?? 0), 0);

    return { upcoming, completed, spend };
  }, [bookings]);

  const visible = useMemo(
    () => (filter === 'all' ? bookings : bookings.filter((row) => row.status === filter)),
    [bookings, filter]
  );

  /**
   * The next place the traveller is actually going. Surfaced above the lists so
   * the dashboard reads destination-first rather than hotel-first.
   */
  const focusDestination = useMemo(() => {
    const next = [...stats.upcoming].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )[0];
    if (!next) return null;

    const name = bookingDestination(next);
    if (!name) return null;

    return { name, id: bookingDestinationId(next), startDate: next.start_date };
  }, [stats.upcoming]);

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
              Your next stay starts {formatDate(focusDestination.startDate)}.
            </p>
          </div>
          {focusDestination.id ? (
            <ButtonLink href={`/destinations/${focusDestination.id}`} size="sm" variant="outline">
              Explore {focusDestination.name}
            </ButtonLink>
          ) : null}
        </section>
      ) : null}

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Bookings"
          value={String(bookings.length)}
          hint="Every stay you have booked"
          tone="bg-sea-500"
        />
        <StatCard
          label="Upcoming"
          value={String(stats.upcoming.length)}
          hint="Trips that have not finished yet"
          tone="bg-gold-400"
        />
        <StatCard
          label="Completed"
          value={String(stats.completed.length)}
          hint="Stays you have already taken"
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
            <p className="text-sm text-ink-500">Your next confirmed or pending stays.</p>
          </div>
          <ButtonLink href="/hotels" size="sm" variant="outline">
            Book another stay
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
            description="When you book a hotel it shows up here with its confirmation status."
            action={<ButtonLink href="/hotels">Find a stay</ButtonLink>}
            compact
          />
        ) : (
          <div className="space-y-3">
            {stats.upcoming.slice(0, 3).map((booking) => (
              <BookingCard key={booking._id} booking={booking} payment={payments[booking._id]} />
            ))}
          </div>
        )}
      </section>

      <section id="booking-history" aria-label="Booking history" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Booking history</h2>
            <p className="text-sm text-ink-500">Filter your stays by status.</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter bookings">
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
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
            <Skeleton className="h-32 w-full rounded-panel" />
          </div>
        ) : error ? null : visible.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? 'No bookings yet' : `No ${filter.replace('_', ' ')} bookings`}
            description={
              filter === 'all'
                ? 'Start exploring hotels across Bangladesh and your bookings will appear here.'
                : 'Try a different status filter to see your other bookings.'
            }
            compact
          />
        ) : (
          <div className="space-y-3">
            {visible.map((booking) => (
              <BookingCard key={booking._id} booking={booking} payment={payments[booking._id]} />
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
    </div>
  );
}