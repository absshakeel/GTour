import type { Metadata } from 'next';
import { Suspense } from 'react';
import HotelFilters from '@/components/hotels/HotelFilters';
import { HotelCard } from '@/components/hotels/HotelCard';
import Pagination from '@/components/destinations/Pagination';
import { SectionHeading } from '@/components/home/Section';
import { ButtonLink } from '@gtour/ui';
import { CardSkeletonGrid, EmptyState, ErrorState } from '@gtour/ui';
import { Reveal } from '@gtour/ui';
import { fetchDestinations, fetchHotelSearch } from '@/lib/server-api';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Hotels & stays',
  description:
    'Browse accommodation published on GTour, filter by destination, nightly price and rating, and open a property to see room types and pricing.',
};

const PAGE_SIZE = 9;

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Parses a positive numeric query value, returning `undefined` when unusable. */
function positiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildQueryHref(params: SearchParams, overrides: Record<string, string | undefined>) {
  const merged = new URLSearchParams();
  const source = { ...params, ...overrides };

  Object.entries(source).forEach(([key, value]) => {
    const text = firstValue(value);
    if (text) merged.set(key, text);
  });

  const query = merged.toString();
  return `/hotels${query ? `?${query}` : ''}`;
}

export default async function HotelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const search = firstValue(params.search);
  const destinationId = firstValue(params.destination_id);
  const minPrice = firstValue(params.min_price);
  const maxPrice = firstValue(params.max_price);
  const guests = firstValue(params.guests);
  const minRating = firstValue(params.min_rating);
  const checkIn = firstValue(params.check_in);
  const checkOut = firstValue(params.check_out);
  const sortBy = firstValue(params.sort_by) || 'rating';
  const sortOrder = firstValue(params.sort_order) === 'asc' ? 'asc' : 'desc';
  const parsedPage = Number.parseInt(firstValue(params.page) || '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [result, destinationsResult] = await Promise.all([
    fetchHotelSearch({
      search: search || undefined,
      destination_id: destinationId || undefined,
      min_price: positiveNumber(minPrice),
      max_price: positiveNumber(maxPrice),
      guests: positiveNumber(guests),
      min_rating: minRating ? Number(minRating) : undefined,
      sort_by: sortBy as 'rating' | 'name' | 'created_at' | 'price',
      sort_order: sortOrder,
      page,
      limit: PAGE_SIZE,
      // Only a complete window is forwarded; the API rejects a lone date.
      check_in: checkIn && checkOut ? checkIn : undefined,
      check_out: checkIn && checkOut ? checkOut : undefined,
    }),
    fetchDestinations({ limit: 100 }),
  ]);

  const hotels = result.ok ? result.data.hotels : [];
  const total = result.ok ? result.data.total : 0;
  const pages = result.ok ? result.data.pages : 1;
  const destinations = destinationsResult.ok ? destinationsResult.data : [];

  const hasActiveFilters = Boolean(
    search || destinationId || minPrice || maxPrice || guests || minRating
  );

  return (
    <div className="gtour-section">
      <div className="gtour-container">
        <SectionHeading
          eyebrow="Where to stay"
          title="Stays we have published for you"
          description="Filter by destination, nightly price and rating. Prices come from each property's room rates — availability and totals are always confirmed on the server at booking time."
          action={{ href: '/destinations', label: 'Browse destinations' }}
        />

        <div className="mt-10">
          <HotelFilters
            destinations={destinations}
            values={{
              search,
              destinationId,
              minPrice,
              maxPrice,
              guests,
              minRating,
              sort: `${sortBy}:${sortOrder}`,
              checkIn,
              checkOut,
            }}
            resultCount={total}
          />
        </div>

        <div className="mt-10">
          {!result.ok ? (
            <ErrorState title="Stays are unavailable" description={result.message} />
          ) : hotels.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'No stays match those filters' : 'No stays published yet'}
              description={
                hasActiveFilters
                  ? 'Try widening the price range or clearing the destination filter to see everything we have published.'
                  : 'Our team has not published accommodation yet. In the meantime, explore the destinations we cover.'
              }
              action={
                hasActiveFilters ? (
                  <ButtonLink href="/hotels" variant="outline">
                    Clear filters
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/destinations" variant="outline">
                    Explore destinations
                  </ButtonLink>
                )
              }
            />
          ) : (
            <Suspense fallback={<CardSkeletonGrid count={PAGE_SIZE} />}>
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {hotels.map((hotel, index) => (
                  <li key={hotel._id}>
                    <Reveal delayMs={Math.min(index, 5) * 70}>
                      <HotelCard hotel={hotel} className="h-full" />
                    </Reveal>
                  </li>
                ))}
              </ul>
            </Suspense>
          )}
        </div>

        <Pagination
          className="mt-12"
          page={page}
          pages={pages}
          buildHref={(nextPage) => buildQueryHref(params, { page: String(nextPage) })}
        />
      </div>
    </div>
  );
}
