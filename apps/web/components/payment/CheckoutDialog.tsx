'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, ButtonLink } from '@gtour/ui';
import {
  formatCurrency,
  formatCurrencyPrecise,
  getApiErrorMessage,
  isPaid,
  isRefunded,
  paymentStatusLabel,
  paymentStatusTone,
} from '@gtour/utils';
import {
  downloadInvoice,
  fetchBookingPayment,
  fetchCheckoutQuote,
  startCheckout,
} from '@/lib/tourist-api';
import type { CheckoutQuoteDto, PaymentDto } from '@/lib/tourist-api';

const POLICY_COPY: Record<string, string> = {
  pay_on_request: 'This property collects payment when you send the request.',
  pay_on_confirmation: 'This property collects payment once it accepts your request.',
  pay_on_arrival: 'This property is settled on arrival — no online payment is needed.',
};

interface Props {
  bookingId: string;
  bookingReference?: string;
  onClose: () => void;
}

/**
 * Payment surface for a single booking.
 *
 * The server is the only authority on what is owed and whether payment is
 * allowed right now, so the dialog reads `GET /payments/checkout/quote/:id`
 * instead of calculating anything from the booking row it was handed.
 */
export default function CheckoutDialog({ bookingId, bookingReference, onClose }: Props) {
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextQuote, nextPayment] = await Promise.all([
        fetchCheckoutQuote(bookingId),
        fetchBookingPayment(bookingId),
      ]);
      setQuote(nextQuote);
      setPayment(nextPayment);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const session = await startCheckout(bookingId);
      // Leave the dialog mounted and let the browser navigate; closing it first
      // would flash an empty panel while the gateway page loads.
      window.location.assign(session.gatewayPageUrl);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setPaying(false);
    }
  }

  async function invoice() {
    if (!payment) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadInvoice(payment._id);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const paid = isPaid(payment?.payment_status);
  const refunded = isRefunded(payment?.payment_status);
  const captured = paid || refunded;
  const awaitingOwner = quote?.payment_policy === 'pay_on_confirmation' && !quote.payment_allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="w-full max-w-lg overflow-hidden rounded-t-panel border border-ink-100 bg-white shadow-lift sm:rounded-panel"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
              Payment
            </p>
            <h2
              id="checkout-title"
              className="mt-1 font-display text-xl font-semibold text-ink-900"
            >
              {bookingReference ? `Booking ${bookingReference}` : 'Your booking'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment window"
            className="shrink-0 rounded-pill border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-600 transition-colors hover:border-sea-400 hover:text-ink-900"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-terracotta-200 bg-terracotta-100/60 px-4 py-3 text-sm text-terracotta-700"
            >
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 animate-pulse rounded-pill bg-sand-200" />
              <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-sand-200" />
              <div className="h-4 w-1/2 animate-pulse rounded-pill bg-sand-200" />
            </div>
          ) : quote ? (
            <>
              <div className="rounded-2xl border border-ink-100 bg-sand-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                  {captured ? 'Amount captured' : 'Amount due'}
                </p>
                <p className="mt-1 font-display text-4xl font-semibold leading-none text-ink-900">
                  {formatCurrencyPrecise(quote.amount, quote.currency)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Badge tone={paymentStatusTone(payment?.payment_status)}>
                    {paymentStatusLabel(payment?.payment_status)}
                  </Badge>
                  {quote.refunded_minor > 0 ? (
                    <span className="text-xs font-medium text-ink-600">
                      Refunded {formatCurrency(quote.refundable, quote.currency)}
                    </span>
                  ) : null}
                </div>
                {payment?.invoice_number ? (
                  <p className="mt-3 text-xs text-ink-500">
                    Invoice{' '}
                    <span className="font-semibold text-ink-700">{payment.invoice_number}</span>
                  </p>
                ) : null}
              </div>

              <p className="text-sm leading-relaxed text-ink-600">
                {POLICY_COPY[quote.payment_policy] ?? 'Payment terms are set by the property.'}
              </p>

              {!captured && !quote.payment_allowed && quote.payment_blocked_reason ? (
                <p className="rounded-2xl border border-gold-200 bg-gold-100/50 px-4 py-3 text-sm text-ink-700">
                  {quote.payment_blocked_reason}
                </p>
              ) : null}

              <p className="text-xs leading-relaxed text-ink-500">
                Payments are processed on the gateway&apos;s own secure page. GTour never sees or
                stores your card details.
              </p>

              {quote.payment_allowed && !captured ? (
                <label
                  htmlFor="checkout-accept-terms"
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm leading-relaxed text-ink-700"
                >
                  <input
                    id="checkout-accept-terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-sea-600 focus:ring-sea-400"
                  />
                  <span>
                    I accept the payment terms and understand the amount above is charged by the
                    property&apos;s payment gateway.
                  </span>
                </label>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-500">This booking has nothing to pay.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-100 bg-sand-50/60 px-6 py-5">
          {captured && payment ? (
            <Button variant="outline" onClick={invoice} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download invoice'}
            </Button>
          ) : null}
          {!loading && quote && !captured && quote.payment_allowed ? (
            <Button onClick={pay} disabled={paying || !termsAccepted}>
              {paying ? 'Opening gateway…' : 'Pay now'}
            </Button>
          ) : null}
          {awaitingOwner ? (
            <ButtonLink href="/dashboard" variant="outline">
              Back to my trips
            </ButtonLink>
          ) : null}
          {captured ? (
            <ButtonLink href="/dashboard" variant="primary">
              Done
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
