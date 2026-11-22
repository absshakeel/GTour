'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, LiveStatus } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { HotelDto } from '@gtour/utils';
import { deleteHotel, fetchMyHotels } from '@/lib/owner-api';
import { formatCurrency } from '@/lib/format';
import PropertyForm from './PropertyForm';
import RoomManager from './RoomManager';

/**
 * Owner's property list with inline create/edit/delete and a per-property room
 * manager. Ownership is enforced by the API; this screen only decides what to
 * show.
 */
export default function PropertyManager() {
  const [hotels, setHotels] = useState<HotelDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formHotel, setFormHotel] = useState<HotelDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roomsFor, setRoomsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyHotels();
      setHotels(data.hotels ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(hotel: HotelDto) {
    if (!window.confirm(`Delete "${hotel.name}"? This cannot be undone.`)) return;

    setBusyId(hotel._id);
    setError(null);
    try {
      await deleteHotel(hotel._id);
      await load();
    } catch (err) {
      // The API blocks deletion while active bookings exist.
      setError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LiveStatus>Loading your properties…</LiveStatus>;
  if (error && hotels.length === 0) return <ErrorState description={error} onRetry={load} compact />;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {error}
        </p>
      ) : null}

      {hotels.length === 0 && !formOpen ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to start listing rooms and taking bookings."
          action={
            <Button
              onClick={() => {
                setFormHotel(null);
                setFormOpen(true);
              }}
            >
              Add a property
            </Button>
          }
        />
      ) : null}

      {hotels.length > 0 ? (
        <ul className="space-y-4">
          {hotels.map((hotel) => {
            const destination =
              typeof hotel.destination_id === 'string' ? null : hotel.destination_id?.name;
            const from = formatCurrency(hotel.price_from);

            return (
              <li
                key={hotel._id}
                className="rounded-card border border-ink-100/80 bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink-900">{hotel.name}</h2>
                    <p className="text-sm text-ink-500">
                      {hotel.address}
                      {destination ? ` · ${destination}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={from ? 'sea' : 'neutral'}>
                        {from ? `From ${from} / night` : 'No room rates yet'}
                      </Badge>
                      {typeof hotel.rating === 'number' ? (
                        <Badge tone="gold">{hotel.rating.toFixed(1)} rating</Badge>
                      ) : null}
                      <span className="text-xs text-ink-500">
                        {(hotel.images ?? []).length} image(s)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRoomsFor(roomsFor === hotel._id ? null : hotel._id)}
                    >
                      {roomsFor === hotel._id ? 'Hide rooms' : 'Manage rooms'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFormHotel(hotel);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === hotel._id}
                      onClick={() => handleDelete(hotel)}
                    >
                      {busyId === hotel._id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </div>

                {roomsFor === hotel._id ? (
                  <div className="mt-4 border-t border-sand-200 pt-4">
                    <RoomManager hotelId={hotel._id} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {formOpen ? (
        <PropertyForm
          hotel={formHotel}
          onSaved={() => {
            setFormOpen(false);
            setFormHotel(null);
            load();
          }}
          onCancel={() => {
            setFormOpen(false);
            setFormHotel(null);
          }}
        />
      ) : hotels.length > 0 ? (
        <Button
          variant="outline"
          onClick={() => {
            setFormHotel(null);
            setFormOpen(true);
          }}
        >
          Add a property
        </Button>
      ) : null}
    </div>
  );
}
