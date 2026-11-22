'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, Field, Input, LiveStatus, Select } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { BookingStatusValue, ProviderBookingDto } from '@gtour/utils';
import { fetchProviderBookings, updateBookingStatus } from '@/lib/owner-api';
import { formatCurrency } from '@/lib/format';

const STATUS_TONES: Record<BookingStatusValue, 'neutral' | 'sea' | 'terracotta' | 'gold' | 'ink'> = {
  pending: 'gold',
  confirmed: 'sea',
  completed: 'neutral',
  cancelled: 'terracotta',
  no_show: 'ink',
};

const FILTERS = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

/**
 * Provider-side status machine, mirroring `bookingWorkflow.ts` so the UI only
 * offers transitions the API will accept. The API remains the authority and
 * still rejects anything illegal.
 */
const ACTIONS: Record<BookingStatusValue, { status: BookingStatusValue; label: string }[]> = {
  pending: [
    { status: 'confirmed', label: 'Confirm' },
    { status: 'cancelled', label: 'Cancel' },
    { status: 'no_show', label: 'No show' },
  ],
  confirmed: [
    { status: 'completed', label: 'Mark completed' },
    { status: 'cancelled', label: 'Cancel' },
    { status: 'no_show', label: 'No show' },
  ],
  completed: [],
  cancelled: [],
  no_show: [],
};

function refLabel(value: { name?: string; room_type?: string } | string | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  return value.name ?? value.room_type ?? '—';
}

/** Booking queue for the signed-in owner, with a status filter and workflow actions. */
export default function BookingQueue() {
  const [bookings, setBookings] = useState<ProviderBookingDto[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await fetchProviderBookings(filter === 'all' ? undefined : filter));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    return bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.status] = (acc[booking.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [bookings]);

  async function applyStatus(booking: ProviderBookingDto, status: BookingStatusValue) {
    setBusyId(booking._id);
    setError(null);
    try {
      await updateBookingStatus(
        booking._id,
        status,
        status === 'cancelled' ? reason.trim() || undefined : undefined
      );
      setCancelling(null);
      setReason('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LiveStatus>Loading bookings…</LiveStatus>;
  if (error && bookings.length === 0) return <ErrorState description={error} onRetry={load} compact />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Filter by status" htmlFor="owner-booking-filter" className="w-52">
          <Select
            id="owner-booking-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All bookings' : value.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
        {counts.pending ? (
          <Badge tone="gold">{counts.pending} awaiting action</Badge>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {error}
        </p>
      ) : null}

      {bookings.length === 0 ? (
        <EmptyState
          compact
          title="No bookings here"
          description={
            filter === 'all'
              ? 'Guest bookings for your properties will appear here as soon as they are made.'
              : `No ${filter.replace('_', ' ')} bookings right now.`
          }
        />
      ) : (
        <ul className="space-y-4">
          {bookings.map((booking) => {
            const actions = ACTIONS[booking.status] ?? [];

            return (
              <li
                key={booking._id}
                className="rounded-card border border-ink-100/80 bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{booking.booking_reference}</p>
                    <p className="text-sm text-ink-500">
                      {refLabel(booking.hotel_id)} · {refLabel(booking.hotel_room_id)}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      Guest: {refLabel(booking.user_id)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[booking.status]}>{booking.status.replace('_', ' ')}</Badge>
                </div>

                <dl className="mt-3 grid gap-2 text-sm text-ink-600 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Check-in</dt>
                    <dd>{booking.start_date?.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Check-out</dt>
                    <dd>{booking.end_date?.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Guests</dt>
                    <dd>
                      {booking.guest_count} guest(s), {booking.room_count ?? 1} room(s)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Total</dt>
                    <dd>{formatCurrency(booking.total_amount) ?? '—'}</dd>
                  </div>
                </dl>

                {booking.special_requests ? (
                  <p className="mt-3 rounded-2xl bg-sand-50 px-4 py-2.5 text-sm text-ink-600">
                    “{booking.special_requests}”
                  </p>
                ) : null}

                {actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        variant={action.status === 'cancelled' || action.status === 'no_show' ? 'ghost' : 'primary'}
                        disabled={busyId === booking._id}
                        onClick={() =>
                          action.status === 'cancelled'
                            ? setCancelling(cancelling === booking._id ? null : booking._id)
                            : applyStatus(booking, action.status)
                        }
                      >
                        {busyId === booking._id ? 'Working…' : action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-ink-400">No further actions for this booking.</p>
                )}

                {cancelling === booking._id ? (
                  <div className="mt-3 space-y-3 rounded-2xl bg-terracotta-50/60 p-4">
                    <Field
                      label="Cancellation reason"
                      htmlFor={`cancel-reason-${booking._id}`}
                      hint="Shared with the guest."
                    >
                      <Input
                        id={`cancel-reason-${booking._id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === booking._id}
                        onClick={() => applyStatus(booking, 'cancelled')}
                      >
                        {busyId === booking._id ? 'Cancelling…' : 'Confirm cancellation'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(null)}>
                        Keep booking
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
