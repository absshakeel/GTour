import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DestinationCta } from '@/components/destinations/DestinationCta';
import { DestinationCard } from '@/components/destinations/DestinationCard';
import { HotelCard } from '@/components/hotels/HotelCard';
import { PhotographerCard } from '@/components/photographers/PhotographerCard';
import { RatingBadge } from '@gtour/ui';
import { ButtonLink } from '@gtour/ui';
import { EmptyState } from '@gtour/ui';
import { Reveal } from '@gtour/ui';
import { destinationImage } from '@/lib/destination-image';
import { fetchDestination, fetchDestinationPage, fetchHotelsForDestination, fetchPhotographers } from '@/lib/server-api';
import { locationLabel, refName, type DestinationDto } from '@gtour/utils';

export const revalidate = 120;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchDestination(id);

  if (!result.ok) {
    return { title: 'Destination not found' };
  }

  const destination = result.data;
  const region = locationLabel(destination.location_id);

  return {
    title: destination.name,
    description:
      destination.description?.slice(0, 155) ??
      `Discover ${destination.name}${region ? ` in ${region}` : ''} on GTour.`,
  };
}

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(value);
}

/** A single labelled fact in the destination summary strip. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-white/80 px-5 py-4">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-lg font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

/** Text-forward related destination strip for internal linking. */
function RelatedDestinations({
  currentId,
  destinations,
}: {
  currentId: string;
  destinations: DestinationDto[];
}) {
  const related = destinations.filter((item) => item._id !== currentId).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-destinations" className="gtour-section border-t border-ink-100">
      <div className="gtour-container">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="related-destinations" className="font-display text-3xl font-semibold text-ink-900">
            More places to consider
          </h2>
          <Link
            href="/destinations"
            className="text-sm font-semibold text-sea-700 underline-offset-4 hover:underline"
          >
            Browse all destinations
          </Link>
        </div>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item, index) => (
            <li key={item._id}>
              <Reveal delayMs={index * 70}>
                <DestinationCard destination={item} imageClassName="aspect-[4/5]" />
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function DestinationDetailPage({ params }: PageProps) {
  const { id } = await params;

  const result = await fetchDestination(id);
  if (!result.ok) notFound();

  const destination = result.data;
  const hero = destinationImage(destination);
  const gallery = (destination.images ?? []).filter(
    (image): image is string => typeof image === 'string' && image.trim().length > 0
  );
  const supporting = gallery.filter((image) => image !== hero.src).slice(0, 4);

  const region = locationLabel(destination.location_id);
  const category = refName(destination.category_id);
  const budget = formatCurrency(destination.estimated_budget);

  const [hotelsResult, photographersResult, suggestionsResult] = await Promise.all([
    fetchHotelsForDestination(destination._id),
    fetchPhotographers(),
    fetchDestinationPage({ sort_by: 'rating', sort_order: 'desc', limit: 4 }),
  ]);

  const hotels = hotelsResult.ok ? hotelsResult.data : [];
  const suggestions = suggestionsResult.ok ? suggestionsResult.data.destinations : [];

  /**
   * Photographers declare the destination they are based in, so the page can
   * show the ones that actually cover this place. Those with no destination set
   * are treated as available everywhere and included too.
   */
  const photographers = photographersResult.ok
    ? photographersResult.data.filter((photographer) => {
        const linked = photographer.destination_id;
        if (!linked) return true;
        const linkedId = typeof linked === 'string' ? linked : linked._id;
        return linkedId === destination._id;
      })
    : [];

  return (
    <article>
      <header className="relative isolate min-h-[62vh] w-full overflow-hidden bg-ink-900">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink-veil" aria-hidden="true" />

        <div className="gtour-container relative flex min-h-[62vh] flex-col justify-end pb-12 pt-28">
          <nav aria-label="Breadcrumb" className="text-xs text-sand-200/85">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/destinations" className="hover:text-white">
                  Destinations
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-white">
                {destination.name}
              </li>
            </ol>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {category ? (
              <span className="rounded-pill bg-white/90 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-700">
                {category}
              </span>
            ) : null}
            <RatingBadge value={destination.average_rating} />
          </div>

          <h1 className="mt-4 max-w-4xl text-balance font-display text-display-sm font-semibold text-white sm:text-display">
            {destination.name}
          </h1>

          {region ? (
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-sand-200/90">
              {region}
            </p>
          ) : null}
        </div>
      </header>

      <section className="gtour-section">
        <div className="gtour-container grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="gtour-eyebrow">The destination</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink-900">
              Why {destination.name} earns a place on your list
            </h2>
            <p className="mt-6 whitespace-pre-line text-pretty text-base leading-relaxed text-ink-600 sm:text-lg">
              {destination.description}
            </p>

            {supporting.length > 0 ? (
              <div className="mt-10">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-400">
                  Gallery
                </h3>
                <ul className="mt-4 grid grid-cols-2 gap-4">
                  {supporting.map((image, index) => (
                    <li
                      key={`${image}-${index}`}
                      className="gtour-media relative aspect-[4/3]"
                    >
                      <Image
                        src={image}
                        alt={`${destination.name} — additional travel photography ${index + 1}`}
                        fill
                        sizes="(min-width: 640px) 25vw, 50vw"
                        className="object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-400">
                At a glance
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Fact label="Average rating" value={destination.average_rating ? `${destination.average_rating.toFixed(1)} / 5` : 'Not rated yet'} />
                <Fact label="Estimated budget" value={budget ?? 'Available on request'} />
                <Fact label="Best season" value={destination.best_visit_season || 'Year-round'} />
                <Fact label="Views" value={new Intl.NumberFormat('en-US').format(destination.views ?? 0)} />
                {region ? <Fact label="Region" value={region} /> : null}
                {category ? <Fact label="Travel style" value={category} /> : null}
              </dl>

              <DestinationCta destinationName={destination.name} />
            </div>
          </aside>
        </div>
      </section>

      <section aria-labelledby="destination-stays" className="gtour-section bg-sand-100">
        <div className="gtour-container">
          <h2 id="destination-stays" className="font-display text-3xl font-semibold text-ink-900">
            Where to stay
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
            Accommodation published for {destination.name}. Prices are shown per stay once you open
            a property.
          </p>

          {hotels.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                title="No stays published here yet"
                description={
                  hotelsResult.ok
                    ? 'Our team is still adding accommodation for this destination. Browse other destinations in the meantime.'
                    : hotelsResult.message
                }
                action={
                  <ButtonLink href="/destinations" variant="outline">
                    Explore other destinations
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {hotels.map((hotel) => (
                <li key={hotel._id}>
                  <HotelCard hotel={hotel} className="h-full" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="destination-photographers" className="gtour-section">
        <div className="gtour-container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="destination-photographers"
                className="font-display text-3xl font-semibold text-ink-900"
              >
                Photographers in {destination.name}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
                Travelling photographers who shoot around this destination. Service packages and
                pricing are published by each photographer.
              </p>
            </div>
            <Link
              href="/photographers"
              className="text-sm font-semibold text-sea-700 underline-offset-4 hover:underline"
            >
              See all photographers
            </Link>
          </div>

          {photographers.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                title="No photographers listed here yet"
                description={
                  photographersResult.ok
                    ? 'Nobody has published a photography service for this destination so far. Browse the full photographer directory in the meantime.'
                    : photographersResult.message
                }
                action={
                  <ButtonLink href="/photographers" variant="outline">
                    Browse photographers
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {photographers.slice(0, 3).map((photographer, index) => (
                <li key={photographer._id}>
                  <Reveal delayMs={index * 70}>
                    <PhotographerCard photographer={photographer} className="h-full" />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="destination-transport" className="gtour-section bg-sand-100">
        <div className="gtour-container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="destination-transport"
                className="font-display text-3xl font-semibold text-ink-900"
              >
                Vehicles around {destination.name}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
                Cars, microbuses and 4x4s with a driver for the roads and rivers around this
                destination.
              </p>
            </div>
            <Link
              href="/vehicles"
              className="text-sm font-semibold text-sea-700 underline-offset-4 hover:underline"
            >
              See all vehicles
            </Link>
          </div>

          <div className="mt-8 rounded-panel border border-ink-100 bg-white/80 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-400">
              Coming soon
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
              Destination-level vehicle availability is not switched on yet. Rental listings live on
              the vehicles page, and a booking is always confirmed against the provider&apos;s own
              calendar on the server.
            </p>
            <div className="mt-5">
              <ButtonLink href="/vehicles" variant="outline">
                Browse vehicles
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {suggestionsResult.ok ? (
        <RelatedDestinations currentId={destination._id} destinations={suggestions} />
      ) : null}
    </article>
  );
}