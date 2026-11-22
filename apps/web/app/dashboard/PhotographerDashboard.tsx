'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { ProviderBookingDto } from '@gtour/utils';
import { fetchMyPhotographer } from '@/lib/provider-api';
import type { MyPhotographerResponse } from '@/lib/provider-api';
import { BOOKING_STATUS_TONES, bookingStatusLabel, formatDate } from '@/lib/booking-status';
import { formatCurrency } from '@/lib/format';
import { serviceImage } from '@/lib/service-image';

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">{value}</p>
      <p className="mt-2 text-xs text-ink-500">{hint}</p>
      <span aria-hidden="true" className={`mt-3 block h-1 w-10 rounded-pill ${tone}`} />
    </div>
  );
}

function bookingTitle(booking: ProviderBookingDto): string {
  const service = booking.photography_service_id;
  if (service && typeof service === 'object' && service.name) return service.name;
  return 'Photography session';
}

function guestName(booking: ProviderBookingDto): string {
  const guest = booking.user_id;
  if (guest && typeof guest === 'object') return guest.name || guest.email || 'Guest';
  return 'Guest';
}

function BookingRow({ booking }: { booking: ProviderBookingDto }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-ink-100/80 bg-sand-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-900">{bookingTitle(booking)}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {guestName(booking)} · {formatDate(booking.start_date)} · {booking.guest_count} guest
          {booking.guest_count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge tone={BOOKING_STATUS_TONES[booking.status]}>{bookingStatusLabel(booking.status)}</Badge>
        <span className="font-display text-sm font-semibold text-ink-900">
          {formatCurrency(booking.total_amount)}
        </span>
      </div>
    </li>
  );
}

/** Workspace for the signed-in photographer: profile, services, portfolio and shoots. */
export default function PhotographerDashboard() {
  const [data, setData] = useState<MyPhotographerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMyPhotographer());
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const services = data?.services ?? [];
    const bookings = data?.bookings ?? [];
    const confirmed = bookings.filter((row) => row.status === 'confirmed').length;
    const revenue = bookings
      .filter((row) => row.status === 'confirmed' || row.status === 'completed')
      .reduce((sum, row) => sum + (row.total_amount ?? 0), 0);
    const prices = services.map((service) => service.price_per_session).filter(Number.isFinite);

    return {
      services,
      bookings,
      confirmed,
      revenue,
      from: prices.length > 0 ? Math.min(...prices) : undefined,
      frames: (data?.portfolio ?? []).reduce((sum, entry) => sum + (entry.images?.length ?? 0), 0),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32 w-full rounded-panel" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-panel" />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void load()} />;
  }

  const photographer = data?.photographer ?? null;

  if (!photographer) {
    return (
      <EmptyState
        title="No photographer profile yet"
        description="This account has no photography listing attached. An administrator can create one, after which your services and bookings appear here."
        action={
          <Button type="button" onClick={() => void load()}>
            Check again
          </Button>
        }
      />
    );
  }

  const cover = serviceImage('photographer', photographer);

  return (
    <div className="space-y-8">
      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Services" value={String(stats.services.length)} hint="Sessions you offer" tone="bg-sea-500" />
        <StatCard label="Shoots" value={String(stats.bookings.length)} hint="All photography bookings" tone="bg-gold-400" />
        <StatCard label="Confirmed" value={String(stats.confirmed)} hint="Dates locked in" tone="bg-terracotta-500" />
        <StatCard
          label="Revenue"
          value={formatCurrency(stats.revenue) ?? '৳0'}
          hint="Confirmed and completed work"
          tone="bg-ink-500"
        />
      </section>

      <section aria-label="Profile" className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div className="h-40 w-full shrink-0 overflow-hidden rounded-2xl bg-sand-100 sm:h-32 sm:w-32">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.src} alt={cover.alt} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-ink-900">{photographer.name}</h2>
              {photographer.rating ? (
                <Badge tone="gold">{photographer.rating.toFixed(1)} rating</Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
              {photographer.bio || 'No biography added yet.'}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {photographer.email ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Email</dt>
                  <dd className="font-medium text-ink-800">{photographer.email}</dd>
                </div>
              ) : null}
              {photographer.phone ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Phone</dt>
                  <dd className="font-medium text-ink-800">{photographer.phone}</dd>
                </div>
              ) : null}
              {stats.from !== undefined ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">From</dt>
                  <dd className="font-medium text-ink-800">{formatCurrency(stats.from)} per session</dd>
                </div>
              ) : null}
              <div className="flex gap-1.5">
                <dt className="text-ink-400">Portfolio</dt>
                <dd className="font-medium text-ink-800">
                  {stats.frames} image{stats.frames === 1 ? '' : 's'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="shrink-0 space-y-2">
            <ButtonLink href="/photographers" size="sm" variant="outline" className="w-full">
              View public page
            </ButtonLink>
            <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section aria-label="Services">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Your services</h2>
            <p className="text-sm text-ink-500">Sessions travellers can book right now.</p>
          </div>
          <ButtonLink href="/photographers" size="sm" variant="outline">
            See public listing
          </ButtonLink>
        </div>

        {stats.services.length === 0 ? (
          <EmptyState
            title="No services listed"
            description="Add a session so travellers can book your photography."
            compact
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.services.map((service) => {
              const image = serviceImage('photographer', { name: service.name, images: service.images });
              return (
                <article
                  key={service._id}
                  className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft"
                >
                  <div className="h-36 w-full overflow-hidden bg-sand-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-4">
                    <h3 className="truncate text-sm font-semibold text-ink-900">{service.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                      {service.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-display text-base font-semibold text-ink-900">
                        {formatCurrency(service.price_per_session)}
                      </span>
                      <span className="text-xs text-ink-400">{service.duration_hours} h</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Shoot schedule" id="shoots" className="scroll-mt-24">
        <h2 className="font-display text-lg font-semibold text-ink-900">Shoot schedule</h2>
        <p className="mb-3 text-sm text-ink-500">Every photography booking tied to your services.</p>

        {stats.bookings.length === 0 ? (
          <EmptyState
            title="No shoots booked"
            description="Bookings made against your services will appear here with the guest and status."
            compact
          />
        ) : (
          <ul className="space-y-2.5">
            {stats.bookings.map((booking) => (
              <BookingRow key={booking._id} booking={booking} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Portfolio" id="portfolio" className="scroll-mt-24">
        <h2 className="font-display text-lg font-semibold text-ink-900">Portfolio</h2>
        <p className="mb-3 text-sm text-ink-500">Sample frames shown alongside your services.</p>

        {(data?.portfolio ?? []).length === 0 ? (
          <EmptyState title="No portfolio entries" description="Upload work samples to win more bookings." compact />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.portfolio ?? []).map((entry) => {
              const first = entry.images?.[0];
              return (
                <figure
                  key={entry._id}
                  className="overflow-hidden rounded-2xl border border-ink-100/70 bg-white shadow-soft"
                >
                  <div className="h-40 w-full overflow-hidden bg-sand-100">
                    {first ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={first} alt={entry.description || 'Portfolio image'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-ink-400">
                        No image
                      </div>
                    )}
                  </div>
                  <figcaption className="p-3">
                    <p className="line-clamp-2 text-xs text-ink-600">{entry.description || 'Untitled set'}</p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {entry.images?.length ?? 0} image{(entry.images?.length ?? 0) === 1 ? '' : 's'}
                    </p>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-ink-400">
        Need to change a listing?{' '}
        <Link href="/profile" className="font-semibold text-sea-700 hover:text-sea-800">
          Update your account
        </Link>{' '}
        or ask an administrator to edit the service catalogue.
      </p>
    </div>
  );
}