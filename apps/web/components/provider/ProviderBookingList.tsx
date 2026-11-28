'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PaymentDetailDialog,
} from '@gtour/ui';
import { formatCurrency, getApiErrorMessage, paymentStatusLabel, paymentStatusTone } from '@gtour/utils';
import type { BookingStatusValue, PaymentDto, ProviderBookingDto } from '@gtour/utils';
import { BOOKING_STATUS_TONES, bookingStatusLabel, formatDate } from '@/lib/booking-status';
import {
  actionsFor,
  guestLabel,
  notifyBookingChanged,
  providerBookingDestination,
  providerDateLabels,
  providerResourceLabel,
  providerUnitLabel,
} from '@/lib/provider-booking';
import { fetchBookingPayment, updateBookingStatus } from '@/lib/owner-api';

type StatusFilter = 'all' | BookingStatusValue;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Needs action' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Actionable booking list shared by the photographer and vehicle dashboards.
 *
 * Both roles already receive their bookings from `GET /bookings/provider`, which
 * scopes to whatever the caller owns. Only the hotel queue had workflow buttons,
 * so a photographer could not accept a shoot and a fleet owner could not close a
 * rental. This closes that gap without a second endpoint.
 */
export default function ProviderBookingList({
  bookings,
  emptyTitle,
  emptyDescription,
  onChanged,
}: {
  bookings: ProviderBookingDto[];
  emptyTitle: string;
  emptyDescription: string;
  /** Reload the parent dashboard so its stat tiles stay in step. */
  onChanged?: () => void;
}) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The booking waiting on a cancellation reason, if any. */
  const [deciding, setDeciding] = useState<{ id: string; status: BookingStatusValue } | null>(null);
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);

  const counts = useMemo(
    () =>
      bookings.reduce<Record<string, number>>((acc, booking) => {
        acc[booking.status] = (acc[booking.status] ?? 0) + 1;
        return acc;
      }, {}),
    [bookings],
  );

  const visible = useMemo(
    () => (filter === 'all' ? bookings : bookings.filter((row) => row.status === filter)),
    [bookings, filter],
  );

  const applyStatus = useCallback(
    async (booking: ProviderBookingDto, status: BookingStatusValue, why?: string) => {
      setBusyId(booking._id);
      setError(null);
      try {
        await updateBookingStatus(booking._id, status, why);
        setDeciding(null);
        setReason('');
        notifyBookingChanged();
        onChanged?.();
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [onChanged],
  );

  async function openReceipt(booking: ProviderBookingDto) {
    setPaymentBusyId(booking._id);
    setError(null);
    try {
      setPayment(await fetchBookingPayment(booking._id));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setPaymentBusyId(null);
    }
  }

  if (bookings.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} compact />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter bookings">
        {FILTERS.map((option) => {
          const count = option.value === 'all' ? bookings.length : (counts[option.value] ?? 0);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={
                filter === option.value
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

      {error ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          compact
          title="Nothing in this filter"
          description="Try another status to see the rest of your bookings."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((booking) => {
            const actions = actionsFor(booking.status);
            const dates = providerDateLabels(booking);
            const destination = providerBookingDestination(booking);
            const unit = providerUnitLabel(booking);
            const units = booking.booking_type === 'photography' ? 1 : (booking.room_count ?? 1);
            const busy = busyId === booking._id;

            return (
              <li
                key={booking._id}
                className="rounded-2xl border border-ink-100/80 bg-white p-4 shadow-soft sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {providerResourceLabel(booking)}
                    </p>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-ink-400">
                      {destination ? `${destination.name} · ` : ''}
                      {booking.booking_reference}
                    </p>
                  </div>
                  <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
                    {bookingStatusLabel(booking.status)}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">{dates.start}</dt>
                    <dd className="font-medium text-ink-800">{formatDate(booking.start_date)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">{dates.end}</dt>
                    <dd className="font-medium text-ink-800">{formatDate(booking.end_date)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">Guest</dt>
                    <dd className="font-medium text-ink-800">{guestLabel(booking)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">
                      {units} {unit}
                      {units === 1 ? '' : 's'}
                    </dt>
                    <dd className="font-medium text-ink-800">
                      {booking.guest_count} guest{booking.guest_count === 1 ? '' : 's'}
                    </dd>
                  </div>
                </dl>

                {booking.special_requests ? (
                  <p className="mt-3 rounded-xl bg-sand-50 px-3 py-2 text-xs text-ink-600">
                    “{booking.special_requests}”
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100/80 pt-3">
                  <span className="font-display text-sm font-semibold text-ink-900">
                    {formatCurrency(booking.total_amount)}
                  </span>
                  {booking.payment ? (
                    <>
                      <Badge tone={paymentStatusTone(booking.payment.payment_status)}>
                        {paymentStatusLabel(booking.payment.payment_status)}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paymentBusyId === booking._id}
                        onClick={() => void openReceipt(booking)}
                      >
                        {paymentBusyId === booking._id ? 'Opening...' : 'Receipt'}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-ink-500">Not paid yet</span>
                  )}

                  <div className="ml-auto flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        size="sm"
                        variant={
                          action.advance ? 'primary' : action.destructive ? 'ghost' : 'outline'
                        }
                        disabled={busy}
                        onClick={() =>
                          action.destructive
                            ? setDeciding(
                                deciding?.id === booking._id
                                  ? null
                                  : { id: booking._id, status: action.status },
                              )
                            : void applyStatus(booking, action.status)
                        }
                      >
                        {busy ? 'Working...' : action.label}
                      </Button>
                    ))}
                    {actions.length === 0 ? (
                      <span className="text-xs text-ink-400">No further actions</span>
                    ) : null}
                  </div>
                </div>

                {deciding?.id === booking._id ? (
                  <div className="mt-3 space-y-3 rounded-xl bg-terracotta-50/60 p-3">
                    <Field
                      label={
                        deciding.status === 'no_show'
                          ? 'Mark as a no-show?'
                          : 'Why is this booking being cancelled?'
                      }
                      htmlFor={`provider-reason-${booking._id}`}
                      hint="Shared with the guest. Optional for a no-show."
                    >
                      <Input
                        id={`provider-reason-${booking._id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          void applyStatus(
                            booking,
                            deciding.status,
                            reason.trim() || undefined,
                          )
                        }
                      >
                        {busy
                          ? 'Saving...'
                          : deciding.status === 'no_show'
                            ? 'Confirm no-show'
                            : 'Confirm cancellation'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeciding(null)}>
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

      {payment ? (
        <PaymentDetailDialog
          payment={payment}
          onClose={() => setPayment(null)}
          onChanged={() => {
            setPayment(null);
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}