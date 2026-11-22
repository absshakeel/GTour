import type {
  DestinationDto,
  DestinationsResponse,
  DestinationFiltersResponse,
  HotelDto,
  HotelsResponse,
  PhotographerDto,
  PhotographersResponse,
  PopulatedCategory,
  PopulatedLocation,
  RoomAvailabilityResponse,
  RoomDto,
  RoomQuoteResponse,
  RoomsResponse,
  VehicleDto,
  VehiclesResponse,
} from '@gtour/utils';

const API_BASE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:5051/api/v1';

export type FetchResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Serialises defined, non-empty params into a `?...` query string (or `''`). */
function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const search = query.toString();
  return search ? `?${search}` : '';
}

async function getJson<T>(path: string, revalidateSeconds = 60): Promise<FetchResult<T>> {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: revalidateSeconds },
      // Never let a stalled API block the server render.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 404
            ? 'We could not find what you were looking for.'
            : 'The service is temporarily unavailable.',
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      message: 'We could not reach the travel service. Please try again in a moment.',
    };
  }
}

export async function fetchDestinations(params: {
  search?: string;
  category_id?: string;
  location_id?: string;
  min_rating?: number;
  max_budget?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<FetchResult<DestinationDto[]>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const search = query.toString();
  const result = await getJson<DestinationsResponse>(
    `/destinations${search ? `?${search}` : ''}`
  );

  return result.ok ? { ok: true, data: result.data.destinations ?? [] } : result;
}

/** Full listing with pagination metadata, used by the destination index page. */
export async function fetchDestinationPage(params: {
  search?: string;
  category_id?: string;
  location_id?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<FetchResult<{ destinations: DestinationDto[]; total: number; pages: number }>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const search = query.toString();
  const result = await getJson<DestinationsResponse>(
    `/destinations/search${search ? `?${search}` : ''}`
  );

  if (!result.ok) return result;

  const destinations = result.data.destinations ?? [];

  return {
    ok: true,
    data: {
      destinations,
      total: result.data.pagination?.total ?? destinations.length,
      pages: result.data.pagination?.pages ?? 1,
    },
  };
}

export async function fetchDestination(id: string): Promise<FetchResult<DestinationDto>> {
  const result = await getJson<{ success: boolean; destination: DestinationDto }>(
    `/destinations/${encodeURIComponent(id)}`,
    0
  );

  return result.ok ? { ok: true, data: result.data.destination } : result;
}

export async function fetchDestinationFilters(): Promise<
  FetchResult<{ categories: PopulatedCategory[]; locations: PopulatedLocation[] }>
> {
  const result = await getJson<DestinationFiltersResponse>('/destinations/filters', 300);

  return result.ok
    ? { ok: true, data: { categories: result.data.categories ?? [], locations: result.data.locations ?? [] } }
    : result;
}

/** Hotels for one destination, used by the destination detail page. */
export async function fetchHotelsForDestination(
  destinationId: string,
  limit = 3
): Promise<FetchResult<HotelDto[]>> {
  const query = buildQuery({ destination_id: destinationId, limit });

  const result = await getJson<HotelsResponse>(`/hotels/search${query}`);

  return result.ok ? { ok: true, data: result.data.hotels ?? [] } : result;
}

export async function fetchHotels(limit?: number): Promise<FetchResult<HotelDto[]>> {
  const result = await getJson<HotelsResponse>('/hotels');

  if (!result.ok) return result;

  const hotels = result.data.hotels ?? [];
  return { ok: true, data: typeof limit === 'number' ? hotels.slice(0, limit) : hotels };
}

export type HotelSearchParams = {
  search?: string;
  destination_id?: string;
  min_price?: number;
  max_price?: number;
  guests?: number;
  min_rating?: number;
  sort_by?: 'rating' | 'name' | 'created_at' | 'price';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  /** Stay window; both dates must be supplied together for availability filtering. */
  check_in?: string;
  check_out?: string;
};

/** Hotel discovery with filters, price bounds and pagination metadata. */
export async function fetchHotelSearch(
  params: HotelSearchParams
): Promise<FetchResult<{ hotels: HotelDto[]; total: number; pages: number; page: number }>> {
  const query = buildQuery(params);
  const result = await getJson<HotelsResponse>(`/hotels/search${query}`);

  if (!result.ok) return result;

  const hotels = result.data.hotels ?? [];

  return {
    ok: true,
    data: {
      hotels,
      total: result.data.pagination?.total ?? hotels.length,
      pages: result.data.pagination?.pages ?? 1,
      page: result.data.pagination?.page ?? 1,
    },
  };
}

export async function fetchHotel(id: string): Promise<FetchResult<HotelDto>> {
  const result = await getJson<{ success: boolean; hotel: HotelDto }>(
    `/hotels/${encodeURIComponent(id)}`
  );

  return result.ok ? { ok: true, data: result.data.hotel } : result;
}

export async function fetchRoomsByHotel(hotelId: string): Promise<FetchResult<RoomDto[]>> {
  const result = await getJson<RoomsResponse>(
    `/rooms/hotel/${encodeURIComponent(hotelId)}`,
    0
  );

  return result.ok ? { ok: true, data: result.data.rooms ?? [] } : result;
}

/** Cached calendar of nightly availability for one room type. */
export async function fetchRoomAvailability(
  roomId: string,
  from: string,
  to: string
): Promise<FetchResult<RoomAvailabilityResponse>> {
  const query = new URLSearchParams({ from, to });
  return getJson<RoomAvailabilityResponse>(
    `/rooms/${encodeURIComponent(roomId)}/availability?${query.toString()}`,
    0
  );
}

/** Server-authoritative price for a stay. Never computed on the client. */
export async function fetchRoomQuote(
  roomId: string,
  params: { check_in: string; check_out: string; rooms?: number; guests?: number }
): Promise<FetchResult<RoomQuoteResponse>> {
  const query = new URLSearchParams({
    check_in: params.check_in,
    check_out: params.check_out,
    rooms: String(params.rooms ?? 1),
    guests: String(params.guests ?? 1),
  });

  return getJson<RoomQuoteResponse>(
    `/rooms/${encodeURIComponent(roomId)}/quote?${query.toString()}`,
    0
  );
}

export async function fetchPhotographers(): Promise<FetchResult<PhotographerDto[]>> {
  const result = await getJson<PhotographersResponse>('/photographers');
  return result.ok ? { ok: true, data: result.data.photographers ?? [] } : result;
}

export async function fetchVehicles(): Promise<FetchResult<VehicleDto[]>> {
  const result = await getJson<VehiclesResponse>('/vehicles');
  return result.ok ? { ok: true, data: result.data.vehicles ?? [] } : result;
}