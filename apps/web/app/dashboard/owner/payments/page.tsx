'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, Field, Input, LiveStatus, Select } from '@gtour/ui';
import {
  fetchProviderPayments,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  paymentStatusLabel,
  paymentStatusTone,
  PAYMENT_STATUS_FILTERS,
} from '@gtour/utils';
import type { PaymentDto, PaymentLedgerSummary } from '@gtour/utils';
import { PaymentDetailDialog } from '@gtour/ui';
import OwnerDashboardShell from '../OwnerDashboardShell';

const STATUS_FILTERS = ['all', ...PAYMENT_STATUS_FILTERS] as const;

const PAGE_SIZE = 10;

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function bookingReference(payment: PaymentDto): string {
  if (typeof payment.booking_id === 'string') return payment.booking_id;
  return payment.booking_id?.booking_reference ?? '—';
}

function bookingHotel(payment: PaymentDto): string {
  if (typeof payment.booking_id === 'string') return '—';
  const hotel = payment.booking_id?.hotel_id;
  if (!hotel) return '—';
  return typeof hotel === 'string' ? hotel : hotel.name;
}

function bookingGuest(payment: PaymentDto): string {
  if (typeof payment.booking_id === 'string') return '—';
  const guest = payment.booking_id?.user_id;
  if (!guest) return '—';
  return typeof guest === 'string' ? guest : (guest.name ?? '—');
}

const EMPTY_SUMMARY: PaymentLedgerSummary = {
  captured_minor: 0,
  refunded_minor: 0,
  outstanding_minor: 0,
  captured_count: 0,
  refunded_count: 0,
  failed_count: 0,
  pending_count: 0,
};

/**
 * Money taken against the properties this owner holds.
 *
 * Totals come from the server's aggregation over every matching row, so paging
 * through the ledger never changes them.
 */
export default function OwnerPaymentsPage() {
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [summary, setSummary] = useState<PaymentLedgerSummary>(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProviderPayments({
        page,
        limit: PAGE_SIZE,
        payment_status: status === 'all' ? undefined : status,
        search: appliedSearch || undefined,
        date_from: from || undefined,
        date_to: to || undefined,
      });

      setPayments(data.payments);
      setSummary(data.summary ?? EMPTY_SUMMARY);
      setPagination(data.pagination);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, status, appliedSearch, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(
    () => [
      {
        label: 'Captured',
        value: formatCurrency(summary.captured_minor / 100) ?? '—',
        hint: `${formatNumber(summary.captured_count)} settled payment(s)`,
      },
      {
        label: 'Refunded',
        value: formatCurrency(summary.refunded_minor / 100) ?? '—',
        hint: `${formatNumber(summary.refunded_count)} refunded payment(s)`,
      },
      {
        label: 'Pending',
        value: formatCurrency(summary.outstanding_minor / 100) ?? '—',
        hint: `${formatNumber(summary.pending_count)} awaiting the guest`,
      },
      {
        label: 'Failed attempts',
        value: formatNumber(summary.failed_count),
        hint: 'Guests who could pay again',
      },
    ],
    [summary],
  );

  const first = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const last = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <OwnerDashboardShell
      title="Payments"
      subtitle="Every settlement taken against your properties, with refunds."
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      }
    >
      <div className="space-y-6">
        <section aria-label="Ledger totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-panel border border-ink-100/80 bg-white p-5 shadow-soft"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                {card.label}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-ink-900">{card.value}</p>
              <p className="mt-1 text-xs text-ink-500">{card.hint}</p>
            </div>
          ))}
        </section>

        <section className="rounded-panel border border-ink-100/80 bg-white p-5 shadow-soft">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            <Field label="Status" htmlFor="ledger-status" className="w-48">
              <Select
                id="ledger-status"
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
              >
                {STATUS_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All statuses' : paymentStatusLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Search" htmlFor="ledger-search" className="w-64">
              <Input
                id="ledger-search"
                value={search}
                placeholder="Transaction or invoice number"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>

            <Field label="From" htmlFor="ledger-from" className="w-40">
              <Input
                id="ledger-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setPage(1);
                  setFrom(event.target.value);
                }}
              />
            </Field>

            <Field label="To" htmlFor="ledger-to" className="w-40">
              <Input
                id="ledger-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setPage(1);
                  setTo(event.target.value);
                }}
              />
            </Field>

            <Button type="submit" size="sm" disabled={loading}>
              Apply
            </Button>

            {status !== 'all' || appliedSearch || from || to ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStatus('all');
                  setSearch('');
                  setAppliedSearch('');
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            ) : null}
          </form>
        </section>

        {loading && payments.length === 0 ? (
          <LiveStatus>Loading your payment ledger...</LiveStatus>
        ) : error && payments.length === 0 ? (
          <ErrorState description={error} onRetry={load} compact />
        ) : payments.length === 0 ? (
          <EmptyState
            compact
            title="No payments here"
            description="Settlements taken against your properties will appear here as soon as a guest pays."
          />
        ) : (
          <section className="space-y-3">
            {error ? (
              <p
                role="alert"
                className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700"
              >
                {error}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-panel border border-ink-100/80 bg-white shadow-soft">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="bg-sand-50 text-xs uppercase tracking-[0.12em] text-ink-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Booking</th>
                    <th className="px-4 py-3 font-semibold">Guest</th>
                    <th className="px-4 py-3 font-semibold">Property</th>
                    <th className="px-4 py-3 font-semibold">Taken</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment._id} className="border-t border-ink-100/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{bookingReference(payment)}</p>
                        <p className="text-xs text-ink-400">
                          {payment.invoice_number ?? payment.transaction_reference ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{bookingGuest(payment)}</td>
                      <td className="px-4 py-3 text-ink-600">{bookingHotel(payment)}</td>
                      <td className="px-4 py-3 text-ink-600">
                        {formatDate(payment.payment_date ?? payment.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        {formatCurrency(payment.amount, payment.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={paymentStatusTone(payment.payment_status)}>
                          {paymentStatusLabel(payment.payment_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(payment)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-500">
              <p>
                Showing {first}–{last} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pagination.page >= pagination.pages || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>

      {selected ? (
        <PaymentDetailDialog
          payment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </OwnerDashboardShell>
  );
}
