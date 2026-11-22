'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@gtour/ui';
import type { DestinationDto } from '@gtour/utils';

/** Sort values are encoded as `sort_by:sort_order` so both travel in one control. */
const SORT_OPTIONS = [
  { value: 'rating:desc', label: 'Highest rated' },
  { value: 'price:asc', label: 'Lowest nightly price' },
  { value: 'price:desc', label: 'Highest nightly price' },
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'created_at:desc', label: 'Newest first' },
] as const;

/** `Destination.name` is not globally unique, so the location is shown alongside it. */
function destinationLabel(destination: DestinationDto): string {
  const location = destination.location_id;

  if (typeof location === 'string') return destination.name;
  return [destination.name, location.country].filter(Boolean).join(', ');
}

export interface HotelFilterValues {
  search: string;
  destinationId: string;
  minPrice: string;
  maxPrice: string;
  guests: string;
  minRating: string;
  sort: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Filter bar for the hotel index. It only builds a URL — every filter, sort and
 * page boundary is applied by the API through `GET /hotels`.
 */
export default function HotelFilters({
  destinations,
  values,
  resultCount,
}: {
  destinations: DestinationDto[];
  values: HotelFilterValues;
  resultCount: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(values.search);
  const [destinationId, setDestinationId] = useState(values.destinationId);
  const [minPrice, setMinPrice] = useState(values.minPrice);
  const [maxPrice, setMaxPrice] = useState(values.maxPrice);
  const [guests, setGuests] = useState(values.guests);
  const [minRating, setMinRating] = useState(values.minRating);
  const [sort, setSort] = useState(values.sort);
  const [checkIn, setCheckIn] = useState(values.checkIn);
  const [checkOut, setCheckOut] = useState(values.checkOut);

  // Keep the controls in sync when the URL changes via navigation or back/forward.
  useEffect(() => {
    setSearch(values.search);
    setDestinationId(values.destinationId);
    setMinPrice(values.minPrice);
    setMaxPrice(values.maxPrice);
    setGuests(values.guests);
    setMinRating(values.minRating);
    setSort(values.sort);
    setCheckIn(values.checkIn);
    setCheckOut(values.checkOut);
  }, [
    values.search,
    values.destinationId,
    values.minPrice,
    values.maxPrice,
    values.guests,
    values.minRating,
    values.sort,
    values.checkIn,
    values.checkOut,
  ]);

  function buildUrl(overrides: Partial<HotelFilterValues> = {}) {
    const next = {
      search,
      destinationId,
      minPrice,
      maxPrice,
      guests,
      minRating,
      sort,
      checkIn,
      checkOut,
      ...overrides,
    };
    const [sortBy, sortOrder] = next.sort.split(':');
    const params = new URLSearchParams();

    if (next.search.trim()) params.set('search', next.search.trim());
    if (next.destinationId) params.set('destination_id', next.destinationId);
    if (next.minPrice.trim()) params.set('min_price', next.minPrice.trim());
    if (next.maxPrice.trim()) params.set('max_price', next.maxPrice.trim());
    if (next.guests.trim()) params.set('guests', next.guests.trim());
    if (next.minRating) params.set('min_rating', next.minRating);
    // The API rejects a half-specified window, so only send a complete one.
    if (next.checkIn && next.checkOut) {
      params.set('check_in', next.checkIn);
      params.set('check_out', next.checkOut);
    }
    if (sortBy) params.set('sort_by', sortBy);
    if (sortOrder) params.set('sort_order', sortOrder);

    const query = params.toString();
    return `/hotels${query ? `?${query}` : ''}`;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A changed filter set always returns to the first page.
    router.push(buildUrl());
  }

  function handleClear() {
    setSearch('');
    setDestinationId('');
    setMinPrice('');
    setMaxPrice('');
    setGuests('');
    setMinRating('');
    setSort('rating:desc');
    setCheckIn('');
    setCheckOut('');
    router.push('/hotels');
  }

  const priceError =
    minPrice.trim() && maxPrice.trim() && Number(minPrice) > Number(maxPrice)
      ? 'Minimum price must not exceed the maximum.'
      : null;

  const dateError = checkIn && checkOut && checkOut <= checkIn ? 'Check-out must be after check-in.' : null;
  const dateHint = checkIn && !checkOut ? 'Add a check-out date to filter by availability.' : undefined;

  const hasFilters = Boolean(
    search.trim() ||
      destinationId ||
      minPrice.trim() ||
      maxPrice.trim() ||
      guests.trim() ||
      minRating ||
      (checkIn && checkOut)
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-panel border border-ink-100 bg-white/85 p-5 shadow-soft backdrop-blur-sm sm:p-6"
    >
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Field label="Hotel or area" htmlFor="hotel-search">
            <Input
              id="hotel-search"
              name="search"
              type="search"
              placeholder="Search hotels by name or address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        </div>

        <div className="lg:col-span-4">
          <Field label="Destination" htmlFor="hotel-destination">
            <Select
              id="hotel-destination"
              name="destination_id"
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              <option value="">All destinations</option>
              {destinations.map((destination) => (
                <option key={destination._id} value={destination._id}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="lg:col-span-4">
          <Field label="Sort by" htmlFor="hotel-sort">
            <Select
              id="hotel-sort"
              name="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Min price / night" htmlFor="hotel-min-price" error={priceError ?? undefined}>
            <Input
              id="hotel-min-price"
              name="min_price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
            />
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Max price / night" htmlFor="hotel-max-price">
            <Input
              id="hotel-max-price"
              name="max_price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Any"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            />
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Guests" htmlFor="hotel-guests">
            <Input
              id="hotel-guests"
              name="guests"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Any"
              value={guests}
              onChange={(event) => setGuests(event.target.value)}
            />
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Minimum rating" htmlFor="hotel-rating">
            <Select
              id="hotel-rating"
              name="min_rating"
              value={minRating}
              onChange={(event) => setMinRating(event.target.value)}
            >
              <option value="">Any rating</option>
              <option value="3">3.0+</option>
              <option value="4">4.0+</option>
              <option value="4.5">4.5+</option>
            </Select>
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Check-in" htmlFor="hotel-check-in" error={dateError ?? undefined}>
            <Input
              id="hotel-check-in"
              name="check_in"
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
            />
          </Field>
        </div>

        <div className="lg:col-span-3">
          <Field label="Check-out" htmlFor="hotel-check-out" hint={dateHint}>
            <Input
              id="hotel-check-out"
              name="check_out"
              type="date"
              min={checkIn || undefined}
              value={checkOut}
              onChange={(event) => setCheckOut(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" size="md" disabled={Boolean(priceError || dateError)}>
          Show hotels
        </Button>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="md" onClick={handleClear}>
            Clear filters
          </Button>
        ) : null}
        <p role="status" aria-live="polite" className="text-sm text-ink-500">
          {resultCount === 1 ? '1 hotel' : `${resultCount} hotels`}
        </p>
      </div>
    </form>
  );
}
