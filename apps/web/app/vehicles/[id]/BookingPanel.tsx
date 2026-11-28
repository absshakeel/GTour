'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Field, Input, Textarea } from '@gtour/ui';
import { apiClient, getApiErrorMessage, readToken } from '@gtour/utils';
import type { VehicleDto, VehicleQuoteResponse } from '@gtour/utils';
import { dateInputToIso, formatCurrency, nightsBetween, toDateInputValue } from '@gtour/utils';

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

type Quote = VehicleQuoteResponse['quote'];

/**
 * Vehicle rental panel.
 *
 * The quote endpoint owns pricing and fleet availability, exactly as the room
 * quote does for hotels. The panel asks for a fresh quote whenever the rental
 * window or unit count changes and never sends a total of its own.
 */
export default function VehicleBookingPanel({ vehicle }: { vehicle: VehicleDto }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [units, setUnits] = useState('1');
  const [guestCount, setGuestCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingResponse['booking'] | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const days = nightsBetween(startDate, endDate);
  const fleetSize = Math.max(1, vehicle.default_units ?? 1);
  const maxUnits = Math.max(1, quote?.max_units ?? fleetSize);
  const maxGuests = vehicle.capacity * (Number(units) || 1);

  useEffect(() => {
    setSignedIn(Boolean(readToken()));
  }, []);

  const loadQuote = useCallback(async () => {
    if (!days) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setQuoting(true);
    setQuoteError(null);

    try {
      const { data } = await apiClient.get<VehicleQuoteResponse>(
        `/vehicles/${encodeURIComponent(vehicle._id)}/quote`,
        {
          params: {
            start_date: startDate,
            end_date: endDate,
            units: Number(units) || 1,
          },
        },
      );
      setQuote(data.quote);
    } catch (quoteFailure) {
      setQuote(null);
      setQuoteError(getApiErrorMessage(quoteFailure));
    } finally {
      setQuoting(false);
    }
  }, [vehicle._id, startDate, endDate, units, days]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!readToken()) {
      setError('Sign in to send a rental request.');
      return;
    }
    if (!days) {
      setError('Choose a pick-up and drop-off date; drop-off must be after pick-up.');
      return;
    }
    if (quote && !quote.available) {
      setError('Those days are no longer available. Try different dates or fewer vehicles.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post<BookingResponse>(
        '/bookings',
        {
          booking_type: 'vehicle',
          vehicle_id: vehicle._id,
          start_date: dateInputToIso(startDate),
          end_date: dateInputToIso(endDate),
          guest_count: Number(guestCount) || 1,
          room_count: Number(units) || 1,
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

  if (confirmed) {
    return (
      <div className="rounded-panel border border-sea-200 bg-sea-100/60 p-6">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-700">
          Rental requested
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
          Reference {confirmed.booking_reference}
        </h2>
        <dl className="mt-5 space-y-2 text-sm text-ink-700">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Vehicle</dt>
            <dd className="font-medium">{vehicle.name}</dd>
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
          The provider confirms the rental before the vehicle is held for you.
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
              setStartDate('');
              setEndDate('');
              setNotes('');
            }}
            className="text-sm font-semibold text-ink-600 underline-offset-4 hover:underline"
          >
            Rent another vehicle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-ink-100 bg-white p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Book this vehicle</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        Availability and pricing are checked against the provider&apos;s live fleet before the
        rental is recorded.
      </p>

      {signedIn === false ? (
        <div className="mt-5 rounded-2xl border border-sea-200 bg-sea-100/50 p-4 text-sm">
          <p className="font-semibold text-ink-900">Sign in to book</p>
          <p className="mt-1 text-ink-600">Rentals are tied to your account.</p>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pick-up" htmlFor="rental-start">
            <Input
              id="rental-start"
              type="date"
              min={today}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="Drop-off" htmlFor="rental-end">
            <Input
              id="rental-end"
              type="date"
              min={startDate || today}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Vehicles"
            htmlFor="rental-units"
            hint={
              quote
                ? `${quote.max_units} of ${fleetSize} still free for these days.`
                : `${fleetSize} vehicle${fleetSize === 1 ? '' : 's'} in this provider's fleet.`
            }
          >
            <Input
              id="rental-units"
              type="number"
              min={1}
              max={maxUnits}
              value={units}
              onChange={(event) => {
                setUnits(event.target.value);
                setGuestCount('1');
              }}
            />
          </Field>
          <Field label="Passengers" htmlFor="rental-guests" hint={`Seats up to ${maxGuests}.`}>
            <Input
              id="rental-guests"
              type="number"
              min={1}
              max={maxGuests}
              value={guestCount}
              onChange={(event) => setGuestCount(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes for the provider" htmlFor="rental-notes" hint="Optional.">
          <Textarea
            id="rental-notes"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Pick-up address, driver licence details, child seat..."
          />
        </Field>

        <div className="rounded-2xl bg-sand-100 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-600">
              {quoting
                ? 'Checking the server...'
                : days
                  ? `${days} day${days === 1 ? '' : 's'}`
                  : 'Select dates'}
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">
              {quoting ? '...' : (formatCurrency(quote?.total) ?? '—')}
            </span>
          </div>

          {quoteError ? (
            <p className="mt-1 text-xs text-terracotta-700">{quoteError}</p>
          ) : quote && !quote.available ? (
            <p className="mt-1 text-xs font-medium text-terracotta-700">
              Not enough vehicles for those days. Try other dates or fewer vehicles.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              Quoted by the server for the selected dates and vehicles.
            </p>
          )}

          {quote && quote.nightly.length > 1 ? (
            <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
              {quote.nightly.map((day) => (
                <li key={day.date} className="flex justify-between gap-4">
                  <span>
                    {formatDate(day.date)}
                    {day.status === 'unavailable' ? ' — booked out' : ''}
                    {day.status === 'partial' ? ' — limited' : ''}
                  </span>
                  <span className="font-medium text-ink-700">
                    {formatCurrency(day.price_per_day) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || quoting || (quote ? !quote.available : false)}
        >
          {submitting ? 'Sending request...' : 'Request this vehicle'}
        </Button>
      </form>
    </div>
  );
}
