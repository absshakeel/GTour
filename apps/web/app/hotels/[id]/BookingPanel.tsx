'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select, Textarea } from '@gtour/ui';
import {
  apiClient,
  dateInputToIso,
  formatCurrency,
  getApiErrorMessage,
  nightsBetween,
  readToken,
  readUser,
  toDateInputValue,
} from '@gtour/utils';
import type { AuthUserDto, RoomDto, RoomQuoteDto } from '@gtour/utils';
import CheckoutDialog from '@/components/payment/CheckoutDialog';

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

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** Values a prefilled link (for example a chat booking draft) may supply. */
export interface BookingPrefill {
  room?: string;
  checkIn?: string;
  checkOut?: string;
  rooms?: string;
  guests?: string;
}

/** Only accepts a real room of this hotel, so a stray query string cannot pick another property's inventory. */
function usableRoom(rooms: RoomDto[], candidate?: string): string {
  if (candidate && rooms.some((room) => room._id === candidate)) return candidate;
  return rooms[0]?._id ?? '';
}

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hotel booking panel.
 *
 * Pricing and availability are owned by the API. The panel asks for a server
 * quote whenever the stay changes and only ever sends the room, dates and guest
 * count — never a total, which the server recomputes before accepting the
 * booking. Nothing is presented as confirmed until `POST /bookings` returns.
 *
 * A prefill only seeds the inputs. It is not a booking: the visitor still has to
 * submit the form, and the server prices and validates the stay again.
 */
export default function BookingPanel({
  rooms,
  prefill,
}: {
  rooms: RoomDto[];
  prefill?: BookingPrefill;
}) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [roomId, setRoomId] = useState(usableRoom(rooms, prefill?.room));
  const [startDate, setStartDate] = useState(
    prefill?.checkIn && DATE_INPUT.test(prefill.checkIn) ? prefill.checkIn : '',
  );
  const [endDate, setEndDate] = useState(
    prefill?.checkOut && DATE_INPUT.test(prefill.checkOut) ? prefill.checkOut : '',
  );
  const [guestCount, setGuestCount] = useState(
    prefill?.guests && Number(prefill.guests) > 0 ? prefill.guests : '1',
  );
  const [roomCount, setRoomCount] = useState(
    prefill?.rooms && Number(prefill.rooms) > 0 ? prefill.rooms : '1',
  );
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingResponse['booking'] | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [quote, setQuote] = useState<RoomQuoteDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const today = useMemo(() => toDateInputValue(new Date()), []);

  useEffect(() => {
    setSignedIn(Boolean(readToken()));
    setUser(readUser());
  }, []);

  const room = rooms.find((item) => item._id === roomId) ?? rooms[0];
  const nights = nightsBetween(startDate, endDate);
  const maxGuests = (room?.capacity ?? 1) * (Number(roomCount) || 1);
  /** Live inventory for the chosen dates when known, otherwise the room's own cap. */
  const roomsAvailable = Math.max(1, quote?.max_rooms ?? room?.total_rooms ?? 1);
  const canSubmit = signedIn === true && Boolean(user);

  /**
   * Ask the API to price the stay. The quote is the single source of truth for
   * what the guest will be charged and for how much inventory is left, so it is
   * refreshed whenever an input that affects the price changes.
   *
   * When the requested room count is above what is left, the request is re-sent
   * once for a single room: that is what tells the panel the real ceiling, and
   * it stops an over-request from blanking out a stay that is still bookable.
   */
  const loadQuote = useCallback(async () => {
    if (!room || !nights) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setQuoting(true);
    setQuoteError(null);

    const requested = Number(roomCount) || 1;

    try {
      const fetchQuote = (rooms: number) =>
        apiClient.get<{ success: boolean; quote: RoomQuoteDto }>(
          `/rooms/${encodeURIComponent(room._id)}/quote`,
          {
            params: {
              check_in: startDate,
              check_out: endDate,
              rooms,
              guests: Number(guestCount) || 1,
            },
          },
        );

      let { data } = await fetchQuote(requested);

      if (!data.quote.available && requested > 1) {
        const retry = await fetchQuote(1);
        if (retry.data.quote.available) {
          data = retry.data;
          setRoomCount('1');
        }
      }

      setQuote(data.quote);
    } catch (quoteFailure) {
      setQuote(null);
      setQuoteError(getApiErrorMessage(quoteFailure));
    } finally {
      setQuoting(false);
    }
  }, [roomId, startDate, endDate, roomCount, guestCount, nights, room]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError('Sign in to send a booking request.');
      return;
    }
    if (!room) {
      setError('Select a room type to continue.');
      return;
    }
    if (!nights) {
      setError('Choose a check-in and check-out date; check-out must be after check-in.');
      return;
    }
    if (quote && !quote.available) {
      setError('Those nights are no longer available. Try different dates.');
      return;
    }
    if (Number(roomCount) > roomsAvailable) {
      setError(`Only ${roomsAvailable} room(s) are left for those dates.`);
      return;
    }

    setSubmitting(true);
    try {
      // `total_amount` is intentionally omitted: the server prices the stay and
      // rejects any client figure that does not match its own calculation.
      const { data } = await apiClient.post<BookingResponse>(
        '/bookings',
        {
          booking_type: 'hotel',
          hotel_room_id: room._id,
          start_date: dateInputToIso(startDate),
          end_date: dateInputToIso(endDate),
          guest_count: Number(guestCount) || 1,
          room_count: Number(roomCount) || 1,
          special_requests: specialRequests.trim() || undefined,
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
          Booking recorded
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900">
          Reference {confirmed.booking_reference}
        </h2>
        <dl className="mt-5 space-y-2 text-sm text-ink-700">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Room</dt>
            <dd className="font-medium">{room?.room_type ?? '—'}</dd>
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
          Keep this reference for support. Nothing is charged until the property&rsquo;s payment
          policy allows it — open the payment step to see what is owed.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <Button size="sm" onClick={() => setCheckoutOpen(true)}>
            Continue to payment
          </Button>
          <Link
            href="/dashboard"
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
              setSpecialRequests('');
            }}
            className="text-sm font-semibold text-ink-600 underline-offset-4 hover:underline"
          >
            Book another room
          </button>
        </div>

        {checkoutOpen ? (
          <CheckoutDialog
            bookingId={confirmed._id}
            bookingReference={confirmed.booking_reference}
            onClose={() => setCheckoutOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-ink-100 bg-white p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Check availability</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        Send a booking request for this stay. Availability is verified on the server against room
        inventory before the booking is recorded.
      </p>

      {signedIn === false ? (
        <div className="mt-5 rounded-2xl border border-sea-200 bg-sea-100/50 p-4 text-sm">
          <p className="font-semibold text-ink-900">Sign in to book</p>
          <p className="mt-1 text-ink-600">
            Bookings are tied to your account so you can manage them later.
          </p>
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

        <Field label="Room type" htmlFor="booking-room">
          <Select
            id="booking-room"
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value);
              setGuestCount('1');
              setRoomCount('1');
            }}
          >
            {rooms.map((item) => {
              const price = formatCurrency(item.price_per_night);
              return (
                <option key={item._id} value={item._id}>
                  {item.room_type} — {item.bed_type}, sleeps {item.capacity}
                  {price ? ` · ${price}/night` : ''}
                </option>
              );
            })}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in" htmlFor="booking-start">
            <Input
              id="booking-start"
              type="date"
              min={today}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="Check-out" htmlFor="booking-end">
            <Input
              id="booking-end"
              type="date"
              min={startDate || today}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Rooms"
            htmlFor="booking-rooms"
            hint={
              room
                ? quote
                  ? `${quote.max_rooms} of ${room.total_rooms} room${
                      room.total_rooms === 1 ? '' : 's'
                    } still free for these dates.`
                  : `${room.total_rooms} room${room.total_rooms === 1 ? '' : 's'} of this type in total.`
                : undefined
            }
          >
            <Input
              id="booking-rooms"
              type="number"
              min={1}
              max={roomsAvailable}
              value={roomCount}
              onChange={(event) => setRoomCount(event.target.value)}
            />
          </Field>

          <Field
            label="Guests"
            htmlFor="booking-guests"
            hint={`Selected rooms sleep up to ${maxGuests}.`}
          >
            <Input
              id="booking-guests"
              type="number"
              min={1}
              max={maxGuests}
              value={guestCount}
              onChange={(event) => setGuestCount(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Special requests"
          htmlFor="booking-notes"
          hint="Optional — arrival times, accessibility needs, or room preferences."
        >
          <Textarea
            id="booking-notes"
            maxLength={500}
            value={specialRequests}
            onChange={(event) => setSpecialRequests(event.target.value)}
            placeholder="Late arrival, cot requested, high floor..."
          />
        </Field>

        <div className="rounded-2xl bg-sand-100 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-600">
              {quoting
                ? 'Checking the server…'
                : nights
                  ? `${nights} night${nights === 1 ? '' : 's'}`
                  : 'Select dates'}
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">
              {quoting ? '…' : (formatCurrency(quote?.total) ?? '—')}
            </span>
          </div>

          {quoteError ? (
            <p className="mt-1 text-xs text-terracotta-700">{quoteError}</p>
          ) : quote && !quote.available ? (
            <p className="mt-1 text-xs font-medium text-terracotta-700">
              Not enough rooms for those dates. Try other dates or fewer rooms.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              Quoted by the server for the selected dates, rooms and guests.
            </p>
          )}

          {quote && quote.nightly.length > 1 ? (
            <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
              {quote.nightly.map((night) => (
                <li key={night.date} className="flex justify-between gap-4">
                  <span>
                    {formatDate(night.date)}
                    {night.status === 'unavailable' ? ' — sold out' : ''}
                    {night.status === 'partial' ? ' — limited' : ''}
                  </span>
                  <span className="font-medium text-ink-700">
                    {formatCurrency(night.price_per_night) ?? '—'}
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
          disabled={
            submitting || quoting || rooms.length === 0 || (quote ? !quote.available : false)
          }
        >
          {submitting ? 'Sending request...' : 'Request this room'}
        </Button>
        {signedIn === false ? (
          <p className="text-center text-xs text-ink-500">
            You will be asked to sign in before the request is sent.
          </p>
        ) : null}
      </form>
    </div>
  );
}
