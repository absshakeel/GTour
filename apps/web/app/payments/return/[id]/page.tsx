'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Badge, ButtonLink, Card, CardBody, Skeleton } from '@gtour/ui';
import {
  formatCurrencyPrecise,
  isPaid,
  isRefunded,
  paymentStatusLabel,
  paymentStatusTone,
} from '@gtour/utils';
import { fetchBookingPayment, fetchCheckoutQuote } from '@/lib/tourist-api';
import type { PaymentDto } from '@/lib/tourist-api';

type Outcome = 'success' | 'fail' | 'cancel';

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  panel: string;
  glyph: string;
  dot: string;
}

const COPY: Record<Outcome, Copy> = {
  success: {
    eyebrow: 'Payment received',
    title: 'You are all set',
    body: 'The gateway confirmed your payment. Your receipt is saved under Payments and the booking is waiting in your trip list.',
    accent: 'text-sea-700',
    panel: 'border-sea-200 bg-sea-50',
    glyph: '✓',
    dot: 'border-sea-300',
  },
  fail: {
    eyebrow: 'Payment not completed',
    title: 'The payment did not go through',
    body: 'Nothing has been charged. Reopen the booking below and run the gateway again whenever you are ready.',
    accent: 'text-terracotta-700',
    panel: 'border-terracotta-200 bg-terracotta-50',
    glyph: '!',
    dot: 'border-terracotta-300',
  },
  cancel: {
    eyebrow: 'Checkout closed',
    title: 'You closed the gateway',
    body: 'No payment was taken. Your booking is still reserved and waiting for you in your trip list.',
    accent: 'text-ink-600',
    panel: 'border-ink-200 bg-sand-50',
    glyph: '↺',
    dot: 'border-ink-200',
  },
};

/** Accounting-style timestamp for the receipt block. */
function receiptDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

interface Row {
  label: string;
  value: string;
  mono?: boolean;
}

/**
 * Where the hosted checkout sends the browser back to.
 *
 * The query string is not trusted for the outcome: the gateway reports the real
 * result to the IPN, so this page reflects whatever the API now holds and only
 * falls back to the requested outcome while the notification is still in flight.
 */
export default function PaymentReturnPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const raw = searchParams.get('outcome');
  const requested: Outcome = raw === 'success' || raw === 'fail' || raw === 'cancel' ? raw : 'fail';

  const bookingId = params?.id ?? '';
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [bookingReference, setBookingReference] = useState<string | undefined>();
  const [checking, setChecking] = useState(Boolean(bookingId));

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    async function load() {
      // The gateway notifies the IPN in parallel with this redirect, so give the
      // server a moment before reading the settled row.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const [row, quote] = await Promise.all([
        fetchBookingPayment(bookingId),
        fetchCheckoutQuote(bookingId).catch(() => null),
      ]);
      if (cancelled) return;
      setPayment(row);
      setBookingReference(quote?.booking_reference);
      setChecking(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const settled = payment
    ? isPaid(payment.payment_status) || isRefunded(payment.payment_status)
    : false;
  const copy = COPY[settled ? 'success' : requested];
  const paid = Boolean(payment && isPaid(payment.payment_status));

  const rows: Row[] = [];
  if (payment) {
    rows.push({
      label: 'Amount',
      value: formatCurrencyPrecise(payment.amount, payment.currency) ?? '—',
    });
    if (payment.invoice_number) rows.push({ label: 'Invoice', value: payment.invoice_number });
    if (payment.payment_method) {
      rows.push({ label: 'Method', value: payment.payment_method.replace(/_/g, ' ') });
    }
    if (payment.payment_date) rows.push({ label: 'Settled', value: receiptDate(payment.payment_date) });
    if (payment.transaction_reference) {
      rows.push({ label: 'Gateway ref', value: payment.transaction_reference, mono: true });
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-400">
        <Link href="/" className="transition-colors hover:text-sea-700">
          Home
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span className="text-ink-600">Payment</span>
      </nav>

      <Card className="overflow-hidden">
        <div className={`border-b px-6 py-7 text-center sm:px-8 ${copy.panel}`}>
          <span
            aria-hidden="true"
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white text-2xl font-bold ${copy.dot} ${copy.accent}`}
          >
            {copy.glyph}
          </span>
          <p className={`mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.2em] ${copy.accent}`}>
            {copy.eyebrow}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink-900">{copy.title}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-600">{copy.body}</p>

          {bookingReference ? (
            <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-pill border border-ink-100 bg-white px-4 py-1.5">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Booking
              </span>
              <span className="font-display text-sm font-semibold text-ink-900">
                {bookingReference}
              </span>
            </div>
          ) : null}
        </div>

        <CardBody className="space-y-6">
          {checking ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-medium text-ink-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sea-500" />
                Confirming with the gateway…
              </p>
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : payment ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-ink-900">Receipt</h2>
                <Badge tone={paymentStatusTone(payment.payment_status)}>
                  {paymentStatusLabel(payment.payment_status)}
                </Badge>
              </div>
              <dl className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <dt className="text-sm text-ink-500">{row.label}</dt>
                    <dd
                      className={
                        row.mono
                          ? 'truncate font-mono text-xs font-medium text-ink-700'
                          : 'truncate text-sm font-semibold capitalize text-ink-900'
                      }
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-ink-700">
              We could not load the receipt for this booking. It is still safe — open your trip list
              to see the booking and its payment status.
            </p>
          )}

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/dashboard#booking-history" variant="primary" className="sm:flex-1">
              {paid ? 'Open my trip' : 'Open my booking'}
            </ButtonLink>
            <ButtonLink href="/dashboard/payments" variant="outline" className="sm:flex-1">
              View all payments
            </ButtonLink>
            {!paid ? (
              <ButtonLink href="/dashboard#booking-history" variant="ghost" className="sm:flex-1">
                Try payment again
              </ButtonLink>
            ) : null}
          </div>

          <p className="border-t border-ink-100 pt-4 text-center text-xs leading-relaxed text-ink-400">
            Payments are processed on the gateway&apos;s own secure page. GTour never sees or stores
            your card details.
          </p>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-sm text-ink-500">
        Need something else?{' '}
        <Link href="/destinations" className="font-semibold text-sea-700 hover:underline">
          Keep exploring Bangladesh
        </Link>
        .
      </p>
    </main>
  );
}
