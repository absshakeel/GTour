'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { ProviderBookingDto, VehicleDto } from '@gtour/utils';
import { fetchMyVehicleProvider } from '@/lib/provider-api';
import type { MyVehicleProviderResponse } from '@/lib/provider-api';
import { BOOKING_STATUS_TONES, bookingStatusLabel, formatDate, toCalendarDate } from '@/lib/booking-status';
import { formatCurrency, formatNumber } from '@/lib/format';
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

/** Counts how many of the next `days` calendar days still have free units. */
function openDays(availability: MyVehicleProviderResponse['availability'], vehicleId: string, days = 30) {
  const today = toCalendarDate(new Date().toISOString());
  const limit = toCalendarDate(new Date(Date.now() + days * 86_400_000).toISOString());

  return availability.filter((night) => {
    if (night.vehicle_id !== vehicleId) return false;
    const day = toCalendarDate(night.date);
    return day >= today && day <= limit && night.status !== 'unavailable' && night.available_units > 0;
  }).length;
}

function VehicleCard({
  vehicle,
  available,
  windowDays,
}: {
  vehicle: VehicleDto;
  available: number;
  windowDays: number;
}) {
  const image = serviceImage('vehicle', { name: vehicle.name, images: vehicle.images });

  return (
    <article className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft">
      <div className="h-40 w-full overflow-hidden bg-sand-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-sm font-semibold text-ink-900">{vehicle.name}</h3>
          <Badge tone="sea">{vehicle.type}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Seats {formatNumber(vehicle.capacity)} · {formatCurrency(vehicle.price_per_day)} per day
        </p>

        {vehicle.features?.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {vehicle.features.slice(0, 4).map((feature) => (
              <li
                key={feature}
                className="rounded-pill bg-sand-100 px-2.5 py-1 text-[11px] font-medium text-ink-600"
              >
                {feature}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex items-center justify-between border-t border-ink-100/70 pt-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Next {windowDays} days</span>
          <span className={`text-xs font-semibold ${available > 0 ? 'text-sea-700' : 'text-terracotta-600'}`}>
            {available > 0 ? `${available} days open` : 'Fully booked'}
          </span>
        </div>
      </div>
    </article>
  );
}

function BookingRow({ booking }: { booking: ProviderBookingDto }) {
  const vehicle = booking.vehicle_id;
  const title =
    vehicle && typeof vehicle === 'object' && vehicle.name ? vehicle.name : 'Vehicle rental';
  const guest = booking.user_id;
  const guestLabel = guest && typeof guest === 'object' ? guest.name || guest.email || 'Guest' : 'Guest';

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-ink-100/80 bg-sand-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {guestLabel} · {formatDate(booking.start_date)} · {booking.guest_count} passenger
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

/** Workspace for the signed-in vehicle provider: fleet, availability and rentals. */
export default function VehicleProviderDashboard() {
  const [data, setData] = useState<MyVehicleProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMyVehicleProvider());
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
    const vehicles = data?.vehicles ?? [];
    const bookings = data?.bookings ?? [];
    const active = bookings.filter((row) => row.status === 'confirmed').length;
    const revenue = bookings
      .filter((row) => row.status === 'confirmed' || row.status === 'completed')
      .reduce((sum, row) => sum + (row.total_amount ?? 0), 0);
    const seats = vehicles.reduce((sum, vehicle) => sum + (vehicle.capacity ?? 0), 0);

    return { vehicles, bookings, active, revenue, seats };
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

  const provider = data?.provider ?? null;

  if (!provider) {
    return (
      <EmptyState
        title="No transport listing yet"
        description="This account has no vehicle provider profile attached. An administrator can create one, after which your fleet and rentals appear here."
        action={
          <Button type="button" onClick={() => void load()}>
            Check again
          </Button>
        }
      />
    );
  }

  const availability = data?.availability ?? [];

  return (
    <div className="space-y-8">
      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fleet" value={String(stats.vehicles.length)} hint="Vehicles you operate" tone="bg-sea-500" />
        <StatCard label="Seats" value={formatNumber(stats.seats)} hint="Total passenger capacity" tone="bg-gold-400" />
        <StatCard label="Active rentals" value={String(stats.active)} hint="Confirmed right now" tone="bg-terracotta-500" />
        <StatCard
          label="Revenue"
          value={formatCurrency(stats.revenue) ?? '৳0'}
          hint="Confirmed and completed trips"
          tone="bg-ink-500"
        />
      </section>

      <section aria-label="Company" className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-ink-900">{provider.name}</h2>
              {provider.rating ? <Badge tone="gold">{provider.rating.toFixed(1)} rating</Badge> : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
              {provider.description || 'No company description added yet.'}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {provider.email ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Email</dt>
                  <dd className="font-medium text-ink-800">{provider.email}</dd>
                </div>
              ) : null}
              {provider.phone ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Phone</dt>
                  <dd className="font-medium text-ink-800">{provider.phone}</dd>
                </div>
              ) : null}
              <div className="flex gap-1.5">
                <dt className="text-ink-400">Open days</dt>
                <dd className="font-medium text-ink-800">{availability.length} scheduled</dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 gap-2">
            <ButtonLink href="/vehicles" size="sm" variant="outline">
              Public listing
            </ButtonLink>
            <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section aria-label="Fleet" id="fleet" className="scroll-mt-24">
        <h2 className="font-display text-lg font-semibold text-ink-900">Your fleet</h2>
        <p className="mb-3 text-sm text-ink-500">Availability counts free days in the next 30 days.</p>

        {stats.vehicles.length === 0 ? (
          <EmptyState
            title="No vehicles yet"
            description="Add a vehicle so travellers can book your transport."
            compact
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle._id}
                vehicle={vehicle}
                available={openDays(availability, vehicle._id)}
                windowDays={30}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Rentals" id="rentals" className="scroll-mt-24">
        <h2 className="font-display text-lg font-semibold text-ink-900">Rental requests</h2>
        <p className="mb-3 text-sm text-ink-500">Every booking made against your fleet.</p>

        {stats.bookings.length === 0 ? (
          <EmptyState
            title="No rentals booked"
            description="Vehicle bookings will appear here with the traveller and status."
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
    </div>
  );
}