'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select, Textarea } from '@gtour/ui';
import { apiClient, getApiErrorMessage, readToken } from '@gtour/utils';
import type { PhotographyServiceDto } from '@gtour/utils';
import { dateInputToIso, formatCurrency, nightsBetween, toDateInputValue } from '@gtour/utils';
import { useEffect, useMemo } from 'react';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

interface BookingResponse {
  success: boolean;
  booking: {
    _id: string;
    booking_reference: string;
    status: string;
    total_amount: number;
    start_date: string;
    end_date: string;
  };
}

/**
 * Photography booking panel.
 *
 * A shoot is priced by the provider's own `price_per_session`, so the panel
 * shows that figure and lets the server confirm it. No total is ever computed
 * here — the booking endpoint re-reads the service and rejects a mismatch.
 */
export default function PhotographyBookingPanel({
  services,
}: {
  services: PhotographyServiceDto[];
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?._id ?? '');
  const [sessionDate, setSessionDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guestCount, setGuestCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingResponse['booking'] | null>(null);

  const today = useMemo(() => toDateInputValue(new Date()), []);

  useEffect(() => {
    setSignedIn(Boolean(readToken()));
  }, []);

  const service = services.find((item) => item._id === serviceId) ?? services[0];
  const days = nightsBetween(sessionDate, endDate);
  const estimate = service ? service.price_per_session * (days ?? 1) : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!readToken()) {
      setError('Sign in to send a booking request.');
      return;
    }
    if (!service) {
      setError('Choose a photography package to continue.');
      return;
    }
    if (!sessionDate || !endDate) {
      setError('Choose the session date and the end date.');
      return;
    }
    if (!days) {
      setError('The end date must be after the session date.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post<BookingResponse>(
        '/bookings',
        {
          booking_type: 'photography',
          photography_service_id: service._id,
          start_date: dateInputToIso(sessionDate),
          end_date: dateInputToIso(endDate),
          guest_count: Number(guestCount) || 1,
          special_requests: notes.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${readToken() ?? ''}` } },
      );

      setConfirmed(data.booking);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (services.length === 0) {
    return (
      <div className="rounded-panel border border-ink-100 bg-white p-6 shadow-soft">
        <h2 className="font-display text-xl font-semibold text-ink-900">Booking</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          This photographer has not published a bookable package yet. Check back soon or browse
          other photographers.
        </p>
        <Link
          href="/photographers"
          className="mt-4 inline-block text-sm font-semibold text-sea-700 underline-offset-4 hover:underline"
        >
          Browse photographers
        </Link>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="rounded-panel border border-sea-200 bg-sea-100/60 p-6">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-700">
          Shoot requested
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
          Reference {confirmed.booking_reference}
        </h2>
        <dl className="mt-5 space-y-2 text-sm text-ink-700">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Package</dt>
            <dd className="font-medium">{service?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Dates</dt>
            <dd className="font-medium">
              {formatDate(confirmed.start_date)} → {formatDate(confirmed.end_date)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Recorded price</dt>
            <dd className="font-medium">{formatCurrency(confirmed.total_amount) ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Status</dt>
            <dd className="font-medium capitalize">{confirmed.status}</dd>
          </div>
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-ink-500">
          The photographer confirms the shoot before it is locked in. You will find this booking in
          your dashboard.
        </p>
        <div className="mt-5 flex flex-wrap gap-5">
          <Link
            href="/dashboard#booking-history"
            className="text-sm font-semibold text-sea-700 underline-offset-4 hover:underline"
          >
            Go to my dashboard
          </Link>
          <button
            type="button"
            onClick={() => {
              setConfirmed(null);
              setSessionDate('');
              setEndDate('');
              setNotes('');
            }}
            className="text-sm font-semibold text-ink-600 underline-offset-4 hover:underline"
          >
            Book another shoot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-ink-100 bg-white p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Book this photographer</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        Send a shoot request. The server re-reads the package and re-checks the price before the
        booking is recorded.
      </p>

      {signedIn === false ? (
        <div className="mt-5 rounded-2xl border border-sea-200 bg-sea-100/50 p-4 text-sm">
          <p className="font-semibold text-ink-900">Sign in to book</p>
          <p className="mt-1 text-ink-600">Requests are tied to your account.</p>
          <p className="mt-4 flex flex-wrap gap-5 font-semibold">
            <Link href="/login" className="text-sea-700 underline-offset-4 hover:underline">
              Sign in
            </Link>
            <Link href="/register" className="text-sea-700 underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-terracotta-200 bg-terracotta-100/60 px-4 py-3 text-sm text-terracotta-700"
          >
            {error}
          </div>
        ) : null}

        <Field label="Package" htmlFor="shoot-service">
          <Select
            id="shoot-service"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          >
            {services.map((item) => {
              const price = formatCurrency(item.price_per_session);
              return (
                <option key={item._id} value={item._id}>
                  {item.name} — {item.duration_hours}h{price ? ` · ${price}/session` : ''}
                </option>
              );
            })}
          </Select>
        </Field>

        {service ? (
          <dl className="grid gap-2 rounded-2xl bg-sand-100 px-4 py-3 text-xs text-ink-600 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt>Duration</dt>
              <dd className="font-medium text-ink-800">{service.duration_hours}h on location</dd>
            </div>
            {service.photo_count ? (
              <div className="flex justify-between gap-3">
                <dt>Delivery</dt>
                <dd className="font-medium text-ink-800">{service.photo_count} edited photos</dd>
              </div>
            ) : null}
            {service.delivery_days ? (
              <div className="flex justify-between gap-3">
                <dt>Turnaround</dt>
                <dd className="font-medium text-ink-800">{service.delivery_days} days</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Session date" htmlFor="shoot-start">
            <Input
              id="shoot-start"
              type="date"
              min={today}
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
            />
          </Field>
          <Field
            label="End date"
            htmlFor="shoot-end"
            hint="Multi-day shoots can span several days."
          >
            <Input
              id="shoot-end"
              type="date"
              min={sessionDate || today}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <Field label="People in the shoot" htmlFor="shoot-guests">
          <Input
            id="shoot-guests"
            type="number"
            min={1}
            max={20}
            value={guestCount}
            onChange={(event) => setGuestCount(event.target.value)}
          />
        </Field>

        <Field label="Notes for the photographer" htmlFor="shoot-notes" hint="Optional.">
          <Textarea
            id="shoot-notes"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Locations you love, mood, timings..."
          />
        </Field>

        <div className="rounded-2xl bg-sand-100 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-600">
              {days ? `${days} day${days === 1 ? '' : 's'}` : 'Select dates'}
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">
              {formatCurrency(estimate) ?? '—'}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Estimated from the package price. The server confirms the final amount.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Sending request...' : 'Request this shoot'}
        </Button>
      </form>
    </div>
  );
}
