import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import VehicleBookingPanel from './BookingPanel';
import { EmptyState, Reveal } from '@gtour/ui';
import { formatCurrency } from '@gtour/utils';
import { fetchVehicle } from '@/lib/server-api';
import { serviceImage } from '@/lib/service-image';
import { refName } from '@gtour/utils';

export const revalidate = 120;

type PageProps = { params: Promise<{ id: string }> };

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchVehicle(id);

  if (!result.ok) return { title: result.notFound ? 'Vehicle not found' : 'Vehicle unavailable' };

  const { vehicle } = result.data;

  return {
    title: `${vehicle.name} rental`,
    description: `Rent a ${vehicle.type} seating ${vehicle.capacity} in ${refName(vehicle.provider_id) ?? 'Bangladesh'}.`,
  };
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params;

  const result = await fetchVehicle(id);
  // Only a real 404 becomes a 404 page; a failed fetch throws so the error
  // boundary can offer a retry rather than hide a transient outage.
  if (!result.ok) {
    if (result.notFound) notFound();
    throw new Error(result.message);
  }

  const { vehicle, availability } = result.data;
  const provider = refName(vehicle.provider_id) ?? 'Independent provider';
  const providerRecord = typeof vehicle.provider_id === 'object' ? vehicle.provider_id : undefined;
  const hero = serviceImage('vehicle', vehicle);
  const gallery = (vehicle.images ?? []).filter((image) => image?.trim().length).slice(0, 4);
  const upcoming = availability.slice(0, 14);

  return (
    <article>
      <header className="relative isolate min-h-[44vh] w-full overflow-hidden bg-ink-900">
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-ink-veil" aria-hidden="true" />

        <div className="gtour-container relative flex min-h-[44vh] flex-col justify-end pb-12 pt-28">
          <nav aria-label="Breadcrumb" className="text-xs text-sand-200/85">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/vehicles" className="hover:text-white">
                  Vehicles
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-white">{vehicle.name}</li>
            </ol>
          </nav>

          <div className="mt-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-300">
              {vehicle.type} · {provider}
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">
              {vehicle.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-100/85">
              Seats {vehicle.capacity}
              {vehicle.default_units && vehicle.default_units > 1
                ? ` · ${vehicle.default_units} available in this fleet`
                : ''}
              {formatCurrency(vehicle.price_per_day)
                ? ` · from ${formatCurrency(vehicle.price_per_day)} per day`
                : ''}
            </p>
          </div>
        </div>
      </header>

      <div className="gtour-section">
        <div className="gtour-container grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-12">
            {providerRecord?.description ? (
              <section aria-labelledby="provider-heading">
                <h2
                  id="provider-heading"
                  className="font-display text-2xl font-semibold text-ink-900"
                >
                  About {provider}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-600">
                  {providerRecord.description}
                </p>
              </section>
            ) : null}

            <section aria-labelledby="features-heading">
              <h2
                id="features-heading"
                className="font-display text-2xl font-semibold text-ink-900"
              >
                What you get
              </h2>
              {vehicle.features && vehicle.features.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {vehicle.features.map((feature) => (
                    <li
                      key={feature}
                      className="rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700"
                    >
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-ink-500">
                  This provider has not listed extras yet. Ask about them in your request.
                </p>
              )}
            </section>

            <section aria-labelledby="availability-heading">
              <h2
                id="availability-heading"
                className="font-display text-2xl font-semibold text-ink-900"
              >
                Next two weeks
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Read live from the provider&apos;s fleet calendar.
              </p>
              {upcoming.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="Calendar not published"
                    description="Pick your dates and the server will check availability when you request."
                  />
                </div>
              ) : (
                <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {upcoming.map((day) => {
                    const soldOut = day.status === 'unavailable';
                    return (
                      <li
                        key={day.date}
                        className={[
                          'rounded-2xl border px-3 py-2 text-xs',
                          soldOut
                            ? 'border-terracotta-200 bg-terracotta-100/50 text-terracotta-700'
                            : day.status === 'partial'
                              ? 'border-sand-300 bg-sand-100 text-ink-700'
                              : 'border-ink-100 bg-white text-ink-600',
                        ].join(' ')}
                      >
                        <p className="font-semibold">{DATE_FORMAT.format(new Date(day.date))}</p>
                        <p className="mt-0.5">
                          {soldOut ? 'Booked' : `${day.available_units} free`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {gallery.length > 0 ? (
              <section aria-labelledby="gallery-heading">
                <h2
                  id="gallery-heading"
                  className="font-display text-2xl font-semibold text-ink-900"
                >
                  Photos
                </h2>
                <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {gallery.map((src, index) => (
                    <li
                      key={`${src}-${index}`}
                      className="relative aspect-[4/3] overflow-hidden rounded-card bg-sand-200"
                    >
                      <Image
                        src={src}
                        alt={`${vehicle.name} photo ${index + 1}`}
                        fill
                        sizes="(min-width: 640px) 22vw, 45vw"
                        className="object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="terms-heading">
              <h2 id="terms-heading" className="font-display text-2xl font-semibold text-ink-900">
                Rental terms
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600">
                <li>
                  Price is calculated per day by the server when you request, then fixed on the
                  booking record.
                </li>
                <li>
                  {vehicle.default_units && vehicle.default_units > 1
                    ? `Up to ${vehicle.default_units} identical vehicles can be booked at once.`
                    : 'One vehicle is available per booking window.'}
                </li>
                <li>The provider confirms the request before pick-up details are shared.</li>
              </ul>
            </section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <VehicleBookingPanel vehicle={vehicle} />
            </Reveal>
          </aside>
        </div>
      </div>
    </article>
  );
}
