'use client';

import { useState } from 'react';
import { Badge, Button, Field, Input } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { VehicleDto } from '@gtour/utils';
import { bulkSetVehicleAvailability } from '@/lib/provider-api';
import { nightsBetween, toDateInputValue } from '@gtour/utils';

type Status = 'available' | 'partial' | 'unavailable';

const STATUS_TONES: Record<Status, 'sea' | 'gold' | 'terracotta'> = {
  available: 'sea',
  partial: 'gold',
  unavailable: 'terracotta',
};

/** The API caps `available_units` at the fleet size declared on the vehicle. */
function fleetSize(vehicle: VehicleDto): number {
  return Math.max(1, vehicle.default_units ?? vehicle.capacity);
}

/**
 * Publishes a date range of fleet availability in one request.
 *
 * A block can never exceed the declared fleet size, so setting a range above the
 * cap is rejected here instead of being sent to the API.
 */
export default function FleetAvailabilityEditor({ vehicle }: { vehicle: VehicleDto }) {
  const cap = fleetSize(vehicle);
  const [open, setOpen] = useState(false);
  const [today] = useState(() => toDateInputValue(new Date()));
  const [form, setForm] = useState(() => ({
    start_date: today,
    end_date: toDateInputValue(new Date(Date.now() + 6 * 86_400_000)),
    available_units: String(cap),
    status: 'available' as Status,
  }));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const days = nightsBetween(form.start_date, form.end_date);

  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const units = Number(form.available_units);
    if (!Number.isInteger(units) || units < 0) {
      setError('Available vehicles must be a whole number of 0 or more.');
      return;
    }
    if (units > cap) {
      setError(`This vehicle's fleet size is ${cap}.`);
      return;
    }
    if (!days) {
      setError('The end date must be after the start date.');
      return;
    }

    setSaving(true);
    try {
      const updated = await bulkSetVehicleAvailability(vehicle._id, {
        start_date: form.start_date,
        end_date: form.end_date,
        available_units: units,
        status: form.status,
      });
      setNotice(`Published ${updated} day${updated === 1 ? '' : 's'} of fleet availability.`);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Manage calendar
      </Button>
    );
  }

  return (
    <form
      onSubmit={handlePublish}
      noValidate
      className="mt-3 space-y-3 rounded-2xl border border-sand-200/80 bg-sand-50/70 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">Publish fleet availability</p>
        <Badge tone="neutral">
          {cap} vehicle{cap === 1 ? '' : 's'}
        </Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-2 text-sm text-terracotta-700"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl bg-sea-100/60 px-4 py-2 text-sm text-sea-700">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Start" htmlFor={`fleet-start-${vehicle._id}`} required>
          <Input
            id={`fleet-start-${vehicle._id}`}
            type="date"
            min={today}
            value={form.start_date}
            onChange={(event) => setForm((p) => ({ ...p, start_date: event.target.value }))}
          />
        </Field>
        <Field label="End" htmlFor={`fleet-end-${vehicle._id}`} required hint="Exclusive.">
          <Input
            id={`fleet-end-${vehicle._id}`}
            type="date"
            min={form.start_date || today}
            value={form.end_date}
            onChange={(event) => setForm((p) => ({ ...p, end_date: event.target.value }))}
          />
        </Field>
        <Field label="Vehicles for sale" htmlFor={`fleet-units-${vehicle._id}`} required>
          <Input
            id={`fleet-units-${vehicle._id}`}
            type="number"
            min={0}
            max={cap}
            value={form.available_units}
            onChange={(event) => setForm((p) => ({ ...p, available_units: event.target.value }))}
          />
        </Field>
        <Field
          label="Status"
          htmlFor={`fleet-status-${vehicle._id}`}
          hint="Unavailable closes the range."
        >
          <select
            id={`fleet-status-${vehicle._id}`}
            value={form.status}
            onChange={(event) => setForm((p) => ({ ...p, status: event.target.value as Status }))}
            className="block min-h-[3rem] w-full cursor-pointer rounded-2xl border border-sand-300/90 bg-white/95 px-4 py-3 text-[15px] text-ink-900 focus:border-sea-500 focus:outline-none"
          >
            <option value="available">Available</option>
            <option value="partial">Partial</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Publishing...' : 'Publish range'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Close
        </Button>
        <span className="text-xs text-ink-500">
          {days ? `${days} day${days === 1 ? '' : 's'} selected` : 'Pick a valid date range'}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-400">
        Status colours:{' '}
        {(['available', 'partial', 'unavailable'] as Status[]).map((status) => (
          <span key={status} className="mr-2 inline-flex items-center gap-1">
            <Badge tone={STATUS_TONES[status]}>{status}</Badge>
          </span>
        ))}
      </p>
    </form>
  );
}
