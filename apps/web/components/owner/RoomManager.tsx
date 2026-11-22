'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, LiveStatus } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { RoomDto } from '@gtour/utils';
import { deleteRoom, fetchRooms } from '@/lib/owner-api';
import { formatCurrency } from '@/lib/format';
import RoomForm from './RoomForm';
import AvailabilityEditor from './AvailabilityEditor';

/**
 * Room inventory for one property: list, create, edit, delete and per-room
 * availability editing. The room list is refetched after each mutation so the
 * UI always reflects what the API actually stored.
 */
export default function RoomManager({ hotelId }: { hotelId: string }) {
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formRoom, setFormRoom] = useState<RoomDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [availabilityRoomId, setAvailabilityRoomId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRooms(await fetchRooms(hotelId));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(room: RoomDto) {
    if (!window.confirm(`Delete "${room.room_type}"? This cannot be undone.`)) return;

    setBusyId(room._id);
    setError(null);
    try {
      await deleteRoom(room._id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setFormRoom(null);
    setFormOpen(true);
  }

  function openEdit(room: RoomDto) {
    setFormRoom(room);
    setFormOpen(true);
  }

  if (loading) return <LiveStatus>Loading rooms…</LiveStatus>;
  if (error && rooms.length === 0) return <ErrorState description={error} onRetry={load} compact />;

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {error}
        </p>
      ) : null}

      {rooms.length === 0 ? (
        <EmptyState
          compact
          title="No rooms yet"
          description="Add a room type so guests can book this property."
          action={
            <Button size="sm" onClick={openCreate}>
              Add a room type
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => (
            <li
              key={room._id}
              className="rounded-card border border-ink-100/80 bg-white p-4 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-900">{room.room_type}</p>
                  <p className="text-sm text-ink-500">
                    {room.bed_type} · sleeps {room.capacity} · {room.total_rooms}{' '}
                    {room.total_rooms === 1 ? 'room' : 'rooms'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="sea">{formatCurrency(room.price_per_night) ?? '—'} / night</Badge>
                  <Button size="sm" variant="outline" onClick={() => openEdit(room)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAvailabilityRoomId(availabilityRoomId === room._id ? null : room._id)}
                  >
                    {availabilityRoomId === room._id ? 'Hide calendar' : 'Availability'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === room._id}
                    onClick={() => handleDelete(room)}
                  >
                    {busyId === room._id ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </div>

              {room.amenities?.length ? (
                <p className="mt-2 text-xs text-ink-500">{room.amenities.join(' · ')}</p>
              ) : null}

              {availabilityRoomId === room._id ? (
                <div className="mt-4">
                  <AvailabilityEditor room={room} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <RoomForm
          hotelId={hotelId}
          room={formRoom}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
          onCancel={() => setFormOpen(false)}
        />
      ) : (
        rooms.length > 0 && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            Add a room type
          </Button>
        )
      )}
    </div>
  );
}
