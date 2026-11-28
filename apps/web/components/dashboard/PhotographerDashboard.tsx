'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LiveStatus, Skeleton } from '@gtour/ui';
import { getApiErrorMessage, refName } from '@gtour/utils';
import type { MyPhotographyServiceDto, MyPortfolioDto } from '@gtour/utils';
import {
  deletePhotographyService,
  deletePortfolioEntry,
  fetchMyPhotographer,
  setPhotographyServiceActive,
} from '@/lib/provider-api';
import type { MyPhotographerResponse } from '@/lib/provider-api';
import { formatCurrency } from '@gtour/utils';
import { serviceImage } from '@/lib/service-image';
import PhotographerProfileForm from '@/components/photographer/PhotographerProfileForm';
import ServiceForm from '@/components/photographer/ServiceForm';
import PortfolioForm from '@/components/photographer/PortfolioForm';
import ProviderBookingList from '@/components/provider/ProviderBookingList';

type ServiceEditor = { open: false } | { open: true; service: MyPhotographyServiceDto | null };
type PortfolioEditor = { open: false } | { open: true; entry: MyPortfolioDto | null };

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-panel border border-ink-100/70 bg-white p-5 shadow-soft">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold leading-none text-ink-900">{value}</p>
      <p className="mt-2 text-xs text-ink-500">{hint}</p>
      <span aria-hidden="true" className={`mt-3 block h-1 w-10 rounded-pill ${tone}`} />
    </div>
  );
}

/**
 * Workspace for the signed-in photographer.
 *
 * Everything here is self-service: the profile, the packages, the portfolio and
 * package visibility are all written through endpoints that derive the owner
 * from the bearer token, so the browser cannot act on another account.
 */
export default function PhotographerDashboard() {
  const [data, setData] = useState<MyPhotographerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [serviceEditor, setServiceEditor] = useState<ServiceEditor>({ open: false });
  const [portfolioEditor, setPortfolioEditor] = useState<PortfolioEditor>({ open: false });

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
    const prices = services.map((service) => service.price_per_session).filter(Number.isFinite);

    return {
      services,
      portfolio: data?.portfolio ?? [],
      bookings,
      active: services.filter((service) => service.is_active !== false).length,
      confirmed: bookings.filter((row) => row.status === 'confirmed').length,
      revenue: bookings
        .filter((row) => row.status === 'confirmed' || row.status === 'completed')
        .reduce((sum, row) => sum + (row.total_amount ?? 0), 0),
      from: prices.length > 0 ? Math.min(...prices) : undefined,
      frames: (data?.portfolio ?? []).reduce((sum, entry) => sum + (entry.images?.length ?? 0), 0),
    };
  }, [data]);

  async function toggleActive(service: MyPhotographyServiceDto) {
    setBusyId(service._id);
    setNotice(null);
    setError(null);
    try {
      await setPhotographyServiceActive(service._id, service.is_active === false);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function removeService(service: MyPhotographyServiceDto) {
    if (!window.confirm(`Delete "${service.name}"? Booked sessions keep their record.`)) return;

    setBusyId(service._id);
    setError(null);
    setNotice(null);
    try {
      await deletePhotographyService(service._id);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function removePortfolio(entry: MyPortfolioDto) {
    if (!window.confirm('Delete this gallery set? This cannot be undone.')) return;

    setBusyId(entry._id);
    setError(null);
    setNotice(null);
    try {
      await deletePortfolioEntry(entry._id);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

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

  if (error && !data) {
    return <ErrorState description={error} onRetry={() => void load()} />;
  }

  const photographer = data?.photographer ?? null;

  if (!photographer) {
    return (
      <div className="space-y-5">
        {profileOpen ? (
          <PhotographerProfileForm
            onSaved={() => {
              setProfileOpen(false);
              setNotice('Profile published.');
              void load();
            }}
            onCancel={() => setProfileOpen(false)}
          />
        ) : (
          <EmptyState
            title="Publish your photographer profile"
            description="Add your name, base destination and a profile photo. Packages, portfolio and booking requests all attach to this profile."
            action={
              <Button type="button" onClick={() => setProfileOpen(true)}>
                Create my profile
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const cover = serviceImage('photographer', photographer);

  return (
    <div className="space-y-8">
      {notice ? (
        <p role="status" className="rounded-2xl bg-sea-100/60 px-4 py-3 text-sm text-sea-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Packages"
          value={String(stats.services.length)}
          hint={`${stats.active} visible to travellers`}
          tone="bg-sea-500"
        />
        <StatCard
          label="Shoots"
          value={String(stats.bookings.length)}
          hint="All photography bookings"
          tone="bg-gold-400"
        />
        <StatCard
          label="Confirmed"
          value={String(stats.confirmed)}
          hint="Dates locked in"
          tone="bg-terracotta-500"
        />
        <StatCard
          label="Revenue"
          value={formatCurrency(stats.revenue) ?? '৳0'}
          hint="Confirmed and completed work"
          tone="bg-ink-500"
        />
      </section>

      {profileOpen ? (
        <PhotographerProfileForm
          photographer={photographer}
          onSaved={() => {
            setProfileOpen(false);
            setNotice('Profile updated.');
            void load();
          }}
          onCancel={() => setProfileOpen(false)}
        />
      ) : (
        <section
          aria-label="Profile"
          className="overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft"
        >
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            <div className="h-40 w-full shrink-0 overflow-hidden rounded-2xl bg-sand-100 sm:h-32 sm:w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.src} alt={cover.alt} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-semibold text-ink-900">
                  {photographer.name}
                </h2>
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
                    <dd className="font-medium text-ink-800">
                      {formatCurrency(stats.from)} per session
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Base destination</dt>
                  <dd className="font-medium text-ink-800">
                    {refName(photographer.destination_id) || 'Not set'}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-400">Portfolio</dt>
                  <dd className="font-medium text-ink-800">
                    {stats.frames} image{stats.frames === 1 ? '' : 's'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="shrink-0 space-y-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setProfileOpen(true)}
                className="w-full"
              >
                Edit profile
              </Button>
              <ButtonLink
                href={`/photographers/${photographer._id}`}
                size="sm"
                variant="outline"
                className="w-full"
              >
                View public page
              </ButtonLink>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Services">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Your packages</h2>
            <p className="text-sm text-ink-500">
              Travellers can book anything marked available. Hidden packages stay in your records.
            </p>
          </div>
          {!serviceEditor.open ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setServiceEditor({ open: true, service: null })}
            >
              Add package
            </Button>
          ) : null}
        </div>

        {serviceEditor.open ? (
          <div className="mb-4">
            <ServiceForm
              service={serviceEditor.service}
              onSaved={() => {
                setServiceEditor({ open: false });
                setNotice(serviceEditor.service ? 'Package updated.' : 'Package added.');
                void load();
              }}
              onCancel={() => setServiceEditor({ open: false })}
            />
          </div>
        ) : null}

        {stats.services.length === 0 ? (
          <EmptyState
            title="No packages yet"
            description="Add a session with a price, duration and photos so travellers can book you."
            compact
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.services.map((service) => {
              const image = serviceImage('photographer', {
                name: service.name,
                images: service.images,
              });
              const hidden = service.is_active === false;
              const busy = busyId === service._id;

              return (
                <article
                  key={service._id}
                  className="flex flex-col overflow-hidden rounded-panel border border-ink-100/70 bg-white shadow-soft"
                >
                  <div className="relative h-36 w-full overflow-hidden bg-sand-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
                    {hidden ? (
                      <span className="absolute left-3 top-3 rounded-pill bg-ink-900/85 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-white">
                        Hidden
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="truncate text-sm font-semibold text-ink-900">{service.name}</h3>
                    <p className="mt-1 text-xs text-ink-500">
                      {refName(service.destination_id) || 'Destination not set'}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                      {service.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-display text-base font-semibold text-ink-900">
                        {formatCurrency(service.price_per_session)}
                      </span>
                      <span className="text-ink-400">{service.duration_hours} h</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setServiceEditor({ open: true, service })}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleActive(service)}
                        disabled={busy}
                      >
                        {hidden ? 'Publish' : 'Hide'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeService(service)}
                        disabled={busy}
                      >
                        {busy ? 'Working...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Portfolio" id="portfolio" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Portfolio</h2>
            <p className="text-sm text-ink-500">
              One gallery set per package, shown on your public profile.
            </p>
          </div>
          {!portfolioEditor.open && stats.services.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPortfolioEditor({ open: true, entry: null })}
            >
              Add set
            </Button>
          ) : null}
        </div>

        {portfolioEditor.open ? (
          <div className="mb-4">
            <PortfolioForm
              entry={portfolioEditor.entry}
              services={stats.services}
              onSaved={() => {
                setPortfolioEditor({ open: false });
                setNotice('Portfolio saved.');
                void load();
              }}
              onCancel={() => setPortfolioEditor({ open: false })}
            />
          </div>
        ) : null}

        {stats.services.length === 0 ? (
          <EmptyState
            title="Add a package first"
            description="Portfolio sets attach to a package, so create one before uploading work samples."
            compact
          />
        ) : stats.portfolio.length === 0 ? (
          <EmptyState
            title="No portfolio entries"
            description="Upload work samples so travellers can see your style before booking."
            compact
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.portfolio.map((entry) => {
              const first = entry.images?.[0];
              const service = stats.services.find((row) => row._id === entry.service_id);
              const busy = busyId === entry._id;

              return (
                <figure
                  key={entry._id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-ink-100/70 bg-white shadow-soft"
                >
                  <div className="h-40 w-full overflow-hidden bg-sand-100">
                    {first ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={first}
                        alt={entry.description || 'Portfolio image'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-ink-400">
                        No image
                      </div>
                    )}
                  </div>
                  <figcaption className="flex flex-1 flex-col p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sea-600">
                      {service?.name ?? 'Unassigned'}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-600">
                      {entry.description || 'Untitled set'}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {entry.images?.length ?? 0} image
                      {(entry.images?.length ?? 0) === 1 ? '' : 's'}
                    </p>
                    <div className="mt-3 flex gap-2 border-t border-ink-100 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPortfolioEditor({ open: true, entry })}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void removePortfolio(entry)}
                        disabled={busy}
                      >
                        {busy ? 'Working...' : 'Delete'}
                      </Button>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Shoot schedule" id="shoots" className="scroll-mt-24">
        <h2 className="font-display text-lg font-semibold text-ink-900">Shoot schedule</h2>
        <p className="mb-3 text-sm text-ink-500">
          Every photography booking tied to your packages.
        </p>

        {stats.bookings.length === 0 ? (
          <EmptyState
            title="No shoots booked"
            description="Bookings made against your packages appear here with the guest and status."
            compact
          />
        ) : (
          <ProviderBookingList
            bookings={stats.bookings}
            emptyTitle="No shoots booked"
            emptyDescription="Bookings made against your packages appear here with the guest and status."
            onChanged={() => void load()}
          />
        )}
      </section>

      <p className="text-xs text-ink-400">
        Account details live in{' '}
        <Link href="/profile" className="font-semibold text-sea-700 hover:text-sea-700">
          your profile settings
        </Link>
        .
      </p>
      <LiveStatus>{loading ? 'Refreshing your workspace...' : ''}</LiveStatus>
    </div>
  );
}
