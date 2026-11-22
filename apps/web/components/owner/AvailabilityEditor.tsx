'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, LiveStatus, Select } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { NightlyRateDto, RoomDto } from '@gtour/utils';
import { fetchRoomCalendar, publishAvailability } from '@/lib/owner-api';
import { formatCurrency, nightsBetween, toDateInputValue } from '@/lib/format';

type Status = 'available' | 'unavailable' | 'partial';

const STATUS_TONES: Record<Status, 'sea' | 'terracotta' | 'gold'> = {
  available: 'sea',
  partial: 'gold',
  unavailable: 'terracotta',
};

/** Thirty-day window starting today, which is the range the calendar requests. */
function defaultRange() {
  const from = new Date();
  const to = new Date(from.getTime() + 29 * 86_400_000);
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

/**
 * Publishes nightly availability for a room over a date range.
 *
 * A missing night means "fall back to the room's `total_rooms`", so publishing a
 * window writes explicit overrides for every night in it. Only nights the owner
 * actually wants to change need to be published.
 */
export default function AvailabilityEditor({ room }: { room: RoomDto }) {
  const [range, setRange] = useState(defaultRange);
  const [nights, setNights] = useState<NightlyRateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    start_date: range.from,
    end_date: range.from,
    available_rooms: String(room.total_rooms),
    price_override: '',
    status: 'available' as Status,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoomCalendar(room._id, range.from, range.to);
      setNights(data.nights ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [room._id, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const stayNights = nightsBetween(form.start_date, form.end_date);

  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const availableRooms = Number(form.available_rooms);
    if (!Number.isInteger(availableRooms) || availableRooms < 0) {
      setError('Available rooms must be a whole number of 0 or more.');
      return;
    }
    if (!stayNights) {
      setError('The end date must be after the start date.');
      return;
    }
    if (availableRooms > room.total_rooms) {
      setError(`This room type only has ${room.total_rooms} room(s) in total.`);
      return;
    }

    const priceOverride = form.price_override.trim() === '' ? null : Number(form.price_override);
    if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride <= 0)) {
      setError('Override price must be greater than 0, or left empty.');
      return;
    }

    setSaving(true);
    try {
      await publishAvailability(room._id, {
        start_date: form.start_date,
        end_date: form.end_date,
        available_rooms: availableRooms,
        price_override: priceOverride,
        status: form.status,
      });
      setNotice(
        `Published ${availableRooms} room(s) for ${stayNights} night${stayNights === 1 ? '' : 's'}.`
      );
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-sand-200/80 bg-sand-50/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor={`cal-from-${room._id}`} className="w-40">
          <Input
            id={`cal-from-${room._id}`}
            type="date"
            value={range.from}
            onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
          />
        </Field>
        <Field label="To" htmlFor={`cal-to-${room._id}`} className="w-40">
          <Input
            id={`cal-to-${room._id}`}
            type="date"
            value={range.to}
            onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
          />
        </Field>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? <LiveStatus>Loading availability…</LiveStatus> : null}

      {!loading && nights.length === 0 ? (
        <p className="text-sm text-ink-500">
          No nights returned for this range. Every night otherwise defaults to{' '}
          {room.total_rooms} {room.total_rooms === 1 ? 'room' : 'rooms'}.
        </p>
      ) : null}

      {!loading && nights.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {nights.map((night) => (
            <li
              key={night.date}
              className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-ink-800">
                {night.date.slice(0, 10)}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-ink-500">
                  {night.available_rooms} left · {formatCurrency(night.price_per_night) ?? '—'}
                </span>
                <Badge tone={STATUS_TONES[night.status]}>{night.status}</Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handlePublish} className="space-y-3 border-t border-sand-200 pt-4" noValidate>
        <p className="text-sm font-semibold text-ink-800">Publish a window</p>

        {error ? (
          <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-2.5 text-sm text-terracotta-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-2xl bg-sea-50 px-4 py-2.5 text-sm text-sea-700">
            {notice}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Start" htmlFor={`pub-start-${room._id}`} required>
            <Input
              id={`pub-start-${room._id}`}
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </Field>
          <Field label="End" htmlFor={`pub-end-${room._id}`} required hint="Exclusive.">
            <Input
              id={`pub-end-${room._id}`}
              type="date"
              value={form.end_date}
              onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </Field>
          <Field label="Rooms for sale" htmlFor={`pub-rooms-${room._id}`} required>
            <Input
              id={`pub-rooms-${room._id}`}
              type="number"
              min={0}
              max={room.total_rooms}
              value={form.available_rooms}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, available_rooms: event.target.value }))
              }
            />
          </Field>
          <Field
            label="Status"
            htmlFor={`pub-status-${room._id}`}
            hint="Use unavailable to close the window."
          >
            <Select
              id={`pub-status-${room._id}`}
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Status }))}
            >
              <option value="available">Available</option>
              <option value="partial">Partial</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Nightly price override (BDT)"
          htmlFor={`pub-price-${room._id}`}
          hint={`Leave empty to keep ${formatCurrency(room.price_per_night) ?? 'the room rate'}.`}
        >
          <Input
            id={`pub-price-${room._id}`}
            type="number"
            min={1}
            value={form.price_override}
            onChange={(event) => setForm((prev) => ({ ...prev, price_override: event.target.value }))}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish availability'}
          </Button>
          <span className="text-xs text-ink-500">
            {stayNights
              ? `${stayNights} night${stayNights === 1 ? '' : 's'} selected`
              : 'Pick a valid date range'}
          </span>
        </div>
      </form>
    </div>
  );
}
