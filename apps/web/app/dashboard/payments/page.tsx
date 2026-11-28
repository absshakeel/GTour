'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LiveStatus,
  PaymentDetailDialog,
  Select,
} from '@gtour/ui';
import {
  formatCurrency,
  getApiErrorMessage,
  isPaid,
  isRefunded,
  paymentStatusLabel,
  paymentStatusTone,
} from '@gtour/utils';
import type { PaymentDto } from '@gtour/utils';
import DashboardShell from '../DashboardShell';
import CheckoutDialog from '@/components/payment/CheckoutDialog';
import { fetchBookingPayment, fetchMyBookings } from '@/lib/tourist-api';
import type { TouristBookingDto } from '@/lib/tourist-api';
import {
  bookingResourceName,
  bookingTypeLabel,
  bookingUnitLabel,
} from '@/lib/booking-display';

interface Row {
  booking: TouristBookingDto;
  payment: PaymentDto | null;
}

const FILTERS = ['all', 'unpaid', 'paid', 'refunded'] as const;

type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All payments',
  unpaid: 'Waiting to be paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

function matches(row: Row, filter: Filter): boolean {
  const status = row.payment?.payment_status;

  if (filter === 'unpaid') {
    return !status || ['pending', 'processing', 'failed', 'cancelled', 'expired'].includes(status);
  }
  if (filter === 'paid') {
    return status === 'successful' || status === 'completed' || status === 'partially_refunded';
  }
  return status === 'refunded' || status === 'partially_refunded';
}

/**
 * Traveller receipts.
 *
 * Payments have no list endpoint a guest can call, so the rows are built from
 * the guest's own bookings — the API refuses to return a payment for anyone
 * else's booking.
 */
export default function TravellerPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<TouristBookingDto | null>(null);
  const [detail, setDetail] = useState<PaymentDto | null>(null);

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

  const totals = useMemo(() => {
    let paid = 0;
    let refunded = 0;
    let due = 0;

    for (const row of rows) {
      const status = row.payment?.payment_status;
      if (status === 'successful' || status === 'completed') paid += row.payment?.amount ?? 0;
      if (status === 'partially_refunded' || status === 'refunded') {
        refunded += (row.payment?.refunded_minor ?? 0) / 100;
      }
      if (!status || ['pending', 'processing', 'failed', 'cancelled', 'expired'].includes(status)) {
        due += row.booking.total_amount ?? 0;
      }
    }

    return { paid, refunded, due };
  }, [rows]);

  const visible = useMemo(() => rows.filter((row) => matches(row, filter)), [rows, filter]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <section aria-label="Payment totals" className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Paid', value: totals.paid, hint: 'Settled through the gateway' },
            { label: 'Refunded', value: totals.refunded, hint: 'Returned to you' },
            { label: 'Still due', value: totals.due, hint: 'Bookings awaiting payment' },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-panel border border-ink-100/80 bg-white p-5 shadow-soft"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                {card.label}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-ink-900">
                {formatCurrency(card.value) ?? '—'}
              </p>
              <p className="mt-1 text-xs text-ink-500">{card.hint}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-end justify-between gap-3">
          <Select
            aria-label="Filter payments by status"
            className="w-56"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            {FILTERS.map((value) => (
              <option key={value} value={value}>
                {FILTER_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </section>

        {loading && rows.length === 0 ? (
          <LiveStatus>Loading your payments...</LiveStatus>
        ) : error && rows.length === 0 ? (
          <ErrorState description={error} onRetry={load} compact />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            title="Nothing to show here"
            description={
              filter === 'all'
                ? 'Once you pay for a booking, its receipt and invoice will appear here.'
                : 'No payments match this filter right now.'
            }
          />
        ) : (
          <ul className="space-y-3">
            {visible.map(({ booking, payment }) => {
              const payable =
                booking.status !== 'cancelled' &&
                !isPaid(payment?.payment_status) &&
                !isRefunded(payment?.payment_status);

              return (
                <li
                  key={booking._id}
                  className="rounded-panel border border-ink-100/80 bg-white p-5 shadow-soft"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-lg font-semibold text-ink-900">
                          {booking.booking_reference}
                        </p>
                        <span className="inline-flex items-center gap-1 rounded-pill bg-ink-900/5 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-600">
                          {bookingTypeLabel(booking.booking_type)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-ink-700">
                        {bookingResourceName(booking)}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {booking.start_date?.slice(0, 10)} → {booking.end_date?.slice(0, 10)} ·{' '}
                        {booking.booking_type === 'photography'
                          ? '1 session'
                          : `${booking.room_count} ${bookingUnitLabel(booking).toLowerCase()}${
                              booking.room_count === 1 ? '' : 's'
                            }`}
                      </p>
                      {payment?.invoice_number ? (
                        <p className="mt-0.5 text-xs text-ink-400">
                          Invoice {payment.invoice_number}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-semibold text-ink-900">
                        {formatCurrency(booking.total_amount)}
                      </p>
                      <div className="mt-1">
                        <Badge tone={paymentStatusTone(payment?.payment_status)}>
                          {paymentStatusLabel(payment?.payment_status)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {payment ? (
                      <Button size="sm" variant="outline" onClick={() => setDetail(payment)}>
                        View receipt
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={payable ? 'primary' : 'ghost'}
                      onClick={() => setCheckout(booking)}
                    >
                      {payable ? 'Pay or review' : 'Payment details'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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

      {detail ? (
        <PaymentDetailDialog
          payment={detail}
          canRefund={false}
          onClose={() => setDetail(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </DashboardShell>
  );
}
