'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@gtour/ui';
import { Badge, Button, EmptyState, ErrorState, LiveStatus, Skeleton } from '@gtour/ui';
import AdminShell from '@/components/admin/AdminShell';
import { apiClient, getApiErrorMessage } from '@gtour/utils';
import type { HotelDto, HotelsResponse } from '@gtour/utils';
import { formatCurrency } from '@/lib/format';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  account_status: string;
}

function destinationName(hotel: HotelDto): string {
  const destination = hotel.destination_id;
  if (destination && typeof destination === 'object' && destination.name) return destination.name;
  return '—';
}

function moneyRange(hotel: HotelDto): string {
  const from = formatCurrency(hotel.price_from ?? null);
  const to = formatCurrency(hotel.price_to ?? null);
  if (!from && !to) return '—';
  if (!to || from === to) return from ?? '—';
  return `${from} – ${to}`;
}

/**
 * Registered hotels across the platform. `GET /hotels` does not populate the
 * owner, so owner names are resolved from the admin-only user list.
 */
export default function AdminHotelsPage() {
  const [hotels, setHotels] = useState<HotelDto[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hotelRes, userRes] = await Promise.all([
        apiClient.get<HotelsResponse>('/hotels', { params: { limit: 100 } }),
        apiClient.get<{ success: boolean; users: UserRow[] }>('/users').catch(() => null),
      ]);
      setHotels(hotelRes.data.hotels ?? []);
      setUsers(userRes?.data.users ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const owners = useMemo(() => {
    const map = new Map<string, UserRow>();
    for (const user of users) map.set(user._id, user);
    return map;
  }, [users]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return hotels;
    return hotels.filter((hotel) => {
      const owner = hotel.owner_id ? owners.get(hotel.owner_id) : undefined;
      return [hotel.name, hotel.address, destinationName(hotel), owner?.name, owner?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [hotels, owners, search]);

  const stats = useMemo(() => {
    const ownerIds = new Set(hotels.map((hotel) => hotel.owner_id).filter(Boolean));
    const rated = hotels.filter((hotel) => typeof hotel.rating === 'number');
    const average =
      rated.length > 0
        ? rated.reduce((sum, hotel) => sum + (hotel.rating ?? 0), 0) / rated.length
        : undefined;
    return { ownerCount: ownerIds.size, average };
  }, [hotels]);

  return (
    <AuthGuard requireAdmin>
      <AdminShell
        title="Registered hotels"
        subtitle="Every hotel published on the platform, with its owner and nightly price range."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Hotels', value: String(hotels.length), hint: 'Published properties' },
              { label: 'Owners', value: String(stats.ownerCount), hint: 'Distinct hotel owners' },
              {
                label: 'Avg rating',
                value: stats.average ? stats.average.toFixed(1) : '—',
                hint: 'Across rated hotels',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-panel border border-sand-200/90 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(12,28,44,0.35)]"
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
                  {card.label}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink-900">{card.value}</p>
                <p className="mt-1 text-xs text-ink-500">{card.hint}</p>
              </div>
            ))}
          </div>

          <div className="rounded-panel border border-sand-200/90 bg-white shadow-[0_10px_30px_-24px_rgba(12,28,44,0.35)]">
            <div className="flex flex-col gap-3 border-b border-sand-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-900">Hotel directory</h2>
                <p className="text-sm text-ink-500">
                  Read-only view. Owners manage their own listing from the owner dashboard.
                </p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search hotels, owners, addresses…"
                aria-label="Search hotels"
                className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-sea-500 sm:max-w-xs"
              />
            </div>

            <LiveStatus>{loading ? 'Loading hotels…' : `${rows.length} hotel(s)`}</LiveStatus>

            {loading ? (
              <div className="space-y-2 p-4 sm:p-5">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : error ? (
              <div className="p-4 sm:p-5">
                <ErrorState description={error} onRetry={() => void load()} compact />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  title={search ? 'No hotels match that search' : 'No hotels registered yet'}
                  description={
                    search
                      ? 'Try a different hotel name, owner, or address.'
                      : 'Hotel owners will appear here as soon as they publish a property.'
                  }
                  compact
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-sand-200 text-sm">
                  <thead className="bg-sand-50/80">
                    <tr className="text-left text-[0.68rem] uppercase tracking-[0.14em] text-ink-400">
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">Hotel</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Owner</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Destination</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Nightly range</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Rating</th>
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">Listed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-200">
                    {rows.map((hotel) => {
                      const owner = hotel.owner_id ? owners.get(hotel.owner_id) : undefined;
                      const cover = hotel.images?.[0];
                      const listed = hotel.created_at
                        ? new Intl.DateTimeFormat('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          }).format(new Date(hotel.created_at))
                        : '—';
                      return (
                        <tr key={hotel._id} className="align-top transition-colors hover:bg-sand-50/60">
                          <td className="px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-sand-100">
                                {cover ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={cover}
                                    alt={hotel.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-400">
                                    No photo
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-ink-900">{hotel.name}</p>
                                <p className="max-w-[220px] truncate text-xs text-ink-500">
                                  {hotel.address || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {owner ? (
                              <>
                                <p className="font-medium text-ink-800">{owner.name}</p>
                                <p className="text-xs text-ink-500">{owner.email}</p>
                              </>
                            ) : (
                              <span className="text-ink-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-700">{destinationName(hotel)}</td>
                          <td className="px-4 py-3 font-medium text-ink-900">{moneyRange(hotel)}</td>
                          <td className="px-4 py-3">
                            {typeof hotel.rating === 'number' ? (
                              <Badge tone="gold">{hotel.rating.toFixed(1)}</Badge>
                            ) : (
                              <span className="text-ink-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-600 sm:px-5">{listed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AdminShell>
    </AuthGuard>
  );
}