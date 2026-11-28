'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Input, Select } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { VehicleDto } from '@gtour/utils';
import { createVehicle, updateVehicle } from '@/lib/provider-api';
import { fetchDestinationOptions } from '@/lib/owner-api';
import type { DestinationOption } from '@/lib/owner-api';

interface FormState {
  name: string;
  type: string;
  capacity: string;
  price_per_day: string;
  default_units: string;
  features: string;
  destination_id: string;
}

const EMPTY: FormState = {
  name: '',
  type: '',
  capacity: '',
  price_per_day: '',
  default_units: '1',
  features: '',
  destination_id: '',
};

function toFormState(vehicle?: VehicleDto | null): FormState {
  if (!vehicle) return EMPTY;

  return {
    name: vehicle.name ?? '',
    type: vehicle.type ?? '',
    capacity: String(vehicle.capacity ?? ''),
    price_per_day: String(vehicle.price_per_day ?? ''),
    default_units: String(vehicle.default_units ?? 1),
    features: (vehicle.features ?? []).join(', '),
    destination_id:
      typeof vehicle.destination_id === 'string'
        ? vehicle.destination_id
        : (vehicle.destination_id?._id ?? ''),
  };
}

/** Rules mirror `createVehicleSchema`. Features are collected as a comma list. */
export default function VehicleForm({
  vehicle,
  onSaved,
  onCancel,
}: {
  vehicle?: VehicleDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(vehicle));
  const [images, setImages] = useState<string[]>(() => (vehicle?.images ?? []).filter(Boolean));
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'images', string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDestinationOptions()
      .then((options) => {
        if (active) setDestinations(options);
      })
      .catch(() => {
        if (active) setDestinations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setForm(toFormState(vehicle));
    setImages((vehicle?.images ?? []).filter(Boolean));
    setErrors({});
    setMessage(null);
  }, [vehicle]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function validate() {
    const next: Partial<Record<keyof FormState | 'images', string>> = {};
    const capacity = Number(form.capacity);
    const price = Number(form.price_per_day);
    const units = Number(form.default_units);
    const features = form.features
      .split(',')
      .map((feature) => feature.trim())
      .filter(Boolean);

    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    if (form.type.trim().length < 2) next.type = 'Enter at least 2 characters.';
    if (!Number.isInteger(capacity) || capacity <= 0)
      next.capacity = 'Enter a whole number above zero.';
    if (!Number.isFinite(price) || price <= 0) next.price_per_day = 'Enter a price above zero.';
    if (!Number.isInteger(units) || units <= 0)
      next.default_units = 'Enter a whole number above zero.';
    if (features.length === 0) next.features = 'List at least one feature, separated by commas.';
    if (images.length < 1) next.images = 'Upload at least one image.';

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: form.name.trim(),
      type: form.type.trim(),
      capacity,
      price_per_day: price,
      default_units: units,
      features,
      images,
      destination_id: form.destination_id || undefined,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      if (vehicle) {
        await updateVehicle(vehicle._id, payload);
      } else {
        await createVehicle(payload);
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(vehicle);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? `Edit ${vehicle?.name}` : 'Add a vehicle'}
      </h2>

      {message ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle name" htmlFor="vehicle-name" required error={errors.name}>
          <Input
            id="vehicle-name"
            value={form.name}
            invalid={Boolean(errors.name)}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field
          label="Type"
          htmlFor="vehicle-type"
          required
          error={errors.type}
          hint="For example: Sedan, Microbus, 4x4 Jeep."
        >
          <Input
            id="vehicle-type"
            value={form.type}
            invalid={Boolean(errors.type)}
            onChange={(event) => update('type', event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Seats" htmlFor="vehicle-capacity" required error={errors.capacity}>
          <Input
            id="vehicle-capacity"
            type="number"
            min={1}
            value={form.capacity}
            invalid={Boolean(errors.capacity)}
            onChange={(event) => update('capacity', event.target.value)}
          />
        </Field>

        <Field
          label="Price per day (BDT)"
          htmlFor="vehicle-price"
          required
          error={errors.price_per_day}
        >
          <Input
            id="vehicle-price"
            type="number"
            min={1}
            value={form.price_per_day}
            invalid={Boolean(errors.price_per_day)}
            onChange={(event) => update('price_per_day', event.target.value)}
          />
        </Field>

        <Field
          label="Fleet size"
          htmlFor="vehicle-units"
          required
          error={errors.default_units}
          hint="Identical units you can rent at once."
        >
          <Input
            id="vehicle-units"
            type="number"
            min={1}
            value={form.default_units}
            invalid={Boolean(errors.default_units)}
            onChange={(event) => update('default_units', event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Features"
        htmlFor="vehicle-features"
        required
        error={errors.features}
        hint="Comma separated, e.g. AC, driver included, child seat."
      >
        <Input
          id="vehicle-features"
          value={form.features}
          invalid={Boolean(errors.features)}
          onChange={(event) => update('features', event.target.value)}
        />
      </Field>

      <Field
        label="Destination"
        htmlFor="vehicle-destination"
        hint="Where this rental is listed. Leave blank to use your base destination."
      >
        <Select
          id="vehicle-destination"
          value={form.destination_id}
          onChange={(event) => update('destination_id', event.target.value)}
        >
          <option value="">Use my base destination</option>
          {destinations.map((destination) => (
            <option key={destination._id} value={destination._id}>
              {destination.country
                ? `${destination.name} — ${destination.country}`
                : destination.name}
            </option>
          ))}
        </Select>
      </Field>

      <ImageUploader
        id="vehicle-images"
        label="Photos"
        required
        value={images}
        onChange={setImages}
        error={errors.images}
        hint="The first image becomes the cover on your listing cards."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save vehicle' : 'Add vehicle'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
