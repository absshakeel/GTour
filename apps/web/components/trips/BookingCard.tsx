'use client';

import Link from 'next/link';
import { Badge, Button } from '@gtour/ui';
import {
  formatCurrency,
  isPaid,
  isRefunded,
  paymentStatusLabel,
  paymentStatusTone,
} from '@gtour/utils';
import type { PaymentDto } from '@gtour/utils';
import type { TouristBookingDto } from '@/lib/tourist-api';
import {
  BOOKING_STATUS_TONES,
  bookingStatusLabel,
  formatDate,
  stayNights,
} from '@/lib/booking-status';
import {
  bookingCopy,
  bookingCover,
  bookingDestination,
  bookingDestinationId,
  bookingResourceName,
  bookingSubtitle,
  bookingTypeLabel,
  bookingUnitLabel,
} from '@/lib/booking-display';

/**
 * One booking, rendered the same way in the dashboard and the trips centre.
 *
 * Type-specific wording comes from `booking-display` rather than from conditionals
 * here, so a photo shoot never reads as a hotel stay. `dense` drops the cover
 * image for the tight lists on the trips page; the dashboard keeps it.
 */
export function BookingCard({
  booking,
  payment,
  onPay,
  dense = false,
}: {
  booking: TouristBookingDto;
  payment?: PaymentDto | null;
  onPay?: (booking: TouristBookingDto) => void;
  /** Trims the card to text only, for long lists. */
  dense?: boolean;
}) {
  const copy = bookingCopy(booking.booking_type);
  const cover = bookingCover(booking);
  const nights = stayNights(booking.start_date, booking.end_date);
  const snapshot = booking.price_snapshot;
  const destination = bookingDestination(booking);
  const destinationId = bookingDestinationId(booking);
  const subtitle = bookingSubtitle(booking);
  const detailHref = copy.detail(booking);
  const status = payment?.payment_status;

  // A cancelled booking is settled: nothing can be charged or refunded from here.
  const payable = booking.status !== 'cancelled' && !isPaid(status) && !isRefunded(status);

  // Photography is a single-day session; vehicles are rented per day.
  const spanIsDays = booking.booking_type === 'vehicle';
  const spanValue = spanIsDays
    ? `${nights} day${nights === 1 ? '' : 's'}`
    : booking.booking_type === 'photography'
      ? '1 day'
      : `${nights} night${nights === 1 ? '' : 's'}`;

  const quantity =
    booking.booking_type === 'photography' ? '1' : String(booking.room_count || 1);

  return (
    <article className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        {dense ? null : (
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-2xl bg-sand-100 sm:h-24 sm:w-32">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={bookingResourceName(booking)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
              <span aria-hidden="true" className="text-lg">
                {booking.booking_type === 'photography'
                  ? '📷'
                  : booking.booking_type === 'vehicle'
                    ? '🚗'
                    : '🏨'}
              </span>
              <span className="text-[11px] font-medium">{bookingTypeLabel(booking.booking_type)}</span>
            </div>
          )}
        </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-pill bg-ink-900/5 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-600">
                  {bookingTypeLabel(booking.booking_type)}
                </span>
                {destination ? (
                  destinationId ? (
                    <Link
                      href={`/destinations/${destinationId}`}
                      className="inline-flex items-center gap-1 rounded-pill bg-sea-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sea-700 transition-colors hover:bg-sea-200"
                    >
                      <span aria-hidden="true">📍</span>
                      {destination}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-sea-100 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sea-700">
                      {destination}
                    </span>
                  )
                ) : null}
              </div>
              <h3 className="truncate font-display text-lg font-semibold text-ink-900">
                {detailHref ? (
                  <Link href={detailHref} className="transition-colors hover:text-sea-700">
                    {bookingResourceName(booking)}
                  </Link>
                ) : (
                  bookingResourceName(booking)
                )}
              </h3>
              {subtitle ? <p className="mt-0.5 truncate text-sm text-ink-500">{subtitle}</p> : null}
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
              <dt className="text-ink-400">
                {booking.booking_type === 'photography'
                  ? 'Shoot date'
                  : booking.booking_type === 'vehicle'
                    ? 'Pick-up'
                    : 'Check-in'}
              </dt>
              <dd className="font-medium text-ink-800">{formatDate(booking.start_date)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">
                {booking.booking_type === 'photography'
                  ? 'Finishes'
                  : booking.booking_type === 'vehicle'
                    ? 'Drop-off'
                    : 'Check-out'}
              </dt>
              <dd className="font-medium text-ink-800">{formatDate(booking.end_date)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">
                {booking.booking_type === 'vehicle' ? 'Duration' : 'Length'}
              </dt>
              <dd className="font-medium text-ink-800">{spanValue}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">{bookingUnitLabel(booking)}s</dt>
              <dd className="font-medium text-ink-800">{quantity}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-400">Guests</dt>
              <dd className="font-medium text-ink-800">{booking.guest_count}</dd>
            </div>
            {payment ? (
              <div className="flex items-center gap-1.5">
                <dt className="text-ink-400">Payment</dt>
                <dd className="font-medium text-ink-800">
                  <Badge tone={paymentStatusTone(status)}>{paymentStatusLabel(status)}</Badge>
                </dd>
              </div>
            ) : null}
          </dl>

          {booking.special_requests ? (
            <p className="mt-3 line-clamp-2 rounded-xl bg-sand-50 px-3 py-2 text-xs text-ink-600">
              “{booking.special_requests}”
            </p>
          ) : null}
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
          <p className="mt-2 text-[11px] font-medium text-ink-400">
            {booking.status === 'pending'
              ? copy.pendingNote
              : booking.status === 'confirmed'
                ? copy.confirmedNote
                : booking.status === 'cancelled'
                  ? 'This booking was cancelled'
                  : booking.status === 'completed'
                    ? 'Trip finished'
                    : 'The provider did not check you in'}
          </p>
          {payable && onPay ? (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onPay(booking)}>
              {status === 'failed' || status === 'cancelled' || status === 'expired'
                ? 'Retry payment'
                : 'Pay now'}
            </Button>
          ) : null}
          {isPaid(status) && onPay ? (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => onPay(booking)}>
              View invoice
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
