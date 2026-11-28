import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PhotographyBookingPanel from './BookingPanel';
import { RatingBadge, Reveal, EmptyState } from '@gtour/ui';
import { formatCurrency } from '@gtour/utils';
import { fetchPhotographer } from '@/lib/server-api';
import { serviceImage } from '@/lib/service-image';
import { refName } from '@gtour/utils';

export const revalidate = 120;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchPhotographer(id);

  if (!result.ok) {
    return { title: result.notFound ? 'Photographer not found' : 'Photographer unavailable' };
  }

  const photographer = result.data.photographer;

  return {
    title: photographer.name,
    description:
      photographer.bio?.slice(0, 155) ?? `Book ${photographer.name} for your trip on GTour.`,
  };
}

export default async function PhotographerDetailPage({ params }: PageProps) {
  const { id } = await params;

  const result = await fetchPhotographer(id);
  // Only a real 404 becomes a 404 page; a failed fetch throws so the error
  // boundary can offer a retry rather than hide a transient outage.
  if (!result.ok) {
    if (result.notFound) notFound();
    throw new Error(result.message);
  }

  const { photographer, services, portfolio } = result.data;
  const destination = refName(photographer.destination_id);
  const hero = serviceImage('photographer', photographer);
  const gallery = portfolio.flatMap((entry) => entry.images ?? []).slice(0, 6);

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
                <Link href="/photographers" className="hover:text-white">
                  Photographers
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-white">{photographer.name}</li>
            </ol>
          </nav>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              {destination ? (
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-300">
                  {destination}
                </p>
              ) : (
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-300">
                  Available for travel
                </p>
              )}
              <h1 className="mt-2 font-display text-4xl font-semibold text-white sm:text-5xl">
                {photographer.name}
              </h1>
              {photographer.bio ? (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-100/85">
                  {photographer.bio}
                </p>
              ) : null}
            </div>
            <RatingBadge value={photographer.rating} />
          </div>
        </div>
      </header>

      <div className="gtour-section">
        <div className="gtour-container grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-12">
            <section aria-labelledby="packages-heading">
              <h2
                id="packages-heading"
                className="font-display text-2xl font-semibold text-ink-900"
              >
                Packages
              </h2>
              {services.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="No packages published"
                    description="This photographer has not published a bookable package yet."
                  />
                </div>
              ) : (
                <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                  {services.map((service, index) => {
                    const price = formatCurrency(service.price_per_session);
                    return (
                      <li key={service._id}>
                        <Reveal delayMs={Math.min(index, 5) * 60}>
                          <div className="flex h-full flex-col rounded-panel border border-ink-100 bg-white p-5 shadow-soft">
                            <h3 className="font-display text-lg font-semibold text-ink-900">
                              {service.name}
                            </h3>
                            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">
                              {service.description}
                            </p>
                            <dl className="mt-4 space-y-1.5 text-xs text-ink-600">
                              <div className="flex justify-between gap-3">
                                <dt>Duration</dt>
                                <dd className="font-medium text-ink-800">
                                  {service.duration_hours}h
                                </dd>
                              </div>
                              {service.photo_count ? (
                                <div className="flex justify-between gap-3">
                                  <dt>Edited photos</dt>
                                  <dd className="font-medium text-ink-800">
                                    {service.photo_count}
                                  </dd>
                                </div>
                              ) : null}
                              {service.delivery_days ? (
                                <div className="flex justify-between gap-3">
                                  <dt>Turnaround</dt>
                                  <dd className="font-medium text-ink-800">
                                    {service.delivery_days} days
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                            {price ? (
                              <p className="mt-auto pt-4">
                                <span className="font-display text-xl font-semibold text-ink-900">
                                  {price}
                                </span>
                                <span className="text-xs text-ink-400"> per session</span>
                              </p>
                            ) : null}
                          </div>
                        </Reveal>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="portfolio-heading">
              <h2
                id="portfolio-heading"
                className="font-display text-2xl font-semibold text-ink-900"
              >
                Portfolio
              </h2>
              {gallery.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="Portfolio coming soon"
                    description="This photographer has not uploaded portfolio images yet."
                  />
                </div>
              ) : (
                <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((src, index) => (
                    <li
                      key={`${src}-${index}`}
                      className="relative aspect-square overflow-hidden rounded-card bg-sand-200"
                    >
                      <Image
                        src={src}
                        alt={`${photographer.name} portfolio image ${index + 1}`}
                        fill
                        sizes="(min-width: 640px) 30vw, 45vw"
                        className="object-cover"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="font-display text-2xl font-semibold text-ink-900">
                Before you book
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-ink-600">
                <li>
                  Send a request with your dates and the photographer confirms it. Nothing is
                  charged on this page.
                </li>
                <li>
                  Pricing is set by the photographer per session and re-checked by the server when
                  the booking is created.
                </li>
                <li>
                  Edited galleries are delivered after the shoot; the package lists the turnaround
                  in days.
                </li>
              </ul>
              {photographer.phone || photographer.email ? (
                <p className="mt-5 text-sm text-ink-600">
                  Contact details are shared after the booking is confirmed.
                </p>
              ) : null}
            </section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <PhotographyBookingPanel services={services} />
          </aside>
        </div>
      </div>
    </article>
  );
}
