'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Input, Select, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { HotelDto } from '@gtour/utils';
import { createHotel, fetchDestinationOptions, updateHotel } from '@/lib/owner-api';
import type { DestinationOption, HotelInput } from '@/lib/owner-api';

interface FormState {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  destination_id: string;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  address: '',
  phone: '',
  email: '',
  destination_id: '',
};

function toImages(hotel?: HotelDto | null): string[] {
  return (hotel?.images ?? []).filter(Boolean);
}

function toFormState(hotel?: HotelDto | null): FormState {
  if (!hotel) return EMPTY;

  return {
    name: hotel.name ?? '',
    description: hotel.description ?? '',
    address: hotel.address ?? '',
    phone: hotel.phone ?? '',
    email: hotel.email ?? '',
    destination_id:
      typeof hotel.destination_id === 'string' ? hotel.destination_id : hotel.destination_id?._id ?? '',
  };
}

/**
 * Create/edit form for a single property. Field limits mirror `createHotelSchema`
 * so the API's validation errors stay the exception, not the normal path.
 */
export default function PropertyForm({
  hotel,
  onSaved,
  onCancel,
}: {
  hotel?: HotelDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(hotel));
  const [images, setImages] = useState<string[]>(() => toImages(hotel));
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'images', string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(hotel));
    setImages(toImages(hotel));
    setErrors({});
    setMessage(null);
  }, [hotel]);

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

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): HotelInput | null {
    const next: Partial<Record<keyof FormState | 'images', string>> = {};

    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    if (form.description.trim().length < 10) next.description = 'Describe the property in at least 10 characters.';
    if (form.address.trim().length < 5) next.address = 'Enter a full address (at least 5 characters).';
    if (!form.destination_id) next.destination_id = 'Choose a destination.';
    if (images.length < 1) next.images = 'Upload at least one image.';

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: form.name.trim(),
      description: form.description.trim(),
      address: form.address.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      images,
      destination_id: form.destination_id,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      if (hotel) {
        await updateHotel(hotel._id, payload);
      } else {
        await createHotel(payload);
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(hotel);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
      noValidate
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? `Edit ${hotel?.name}` : 'Add a property'}
      </h2>

      {message ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="owner-hotel-name" required error={errors.name}>
          <Input
            id="owner-hotel-name"
            value={form.name}
            invalid={Boolean(errors.name)}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field
          label="Destination"
          htmlFor="owner-hotel-destination"
          required
          error={errors.destination_id}
        >
          <Select
            id="owner-hotel-destination"
            value={form.destination_id}
            invalid={Boolean(errors.destination_id)}
            onChange={(event) => update('destination_id', event.target.value)}
          >
            <option value="">Select a destination</option>
            {destinations.map((destination) => (
              <option key={destination._id} value={destination._id}>
                {destination.country ? `${destination.name} — ${destination.country}` : destination.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Address" htmlFor="owner-hotel-address" required error={errors.address}>
        <Input
          id="owner-hotel-address"
          value={form.address}
          invalid={Boolean(errors.address)}
          onChange={(event) => update('address', event.target.value)}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="owner-hotel-description"
        required
        error={errors.description}
      >
        <Textarea
          id="owner-hotel-description"
          value={form.description}
          invalid={Boolean(errors.description)}
          onChange={(event) => update('description', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="owner-hotel-phone" hint="Shown to guests after booking.">
          <Input
            id="owner-hotel-phone"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="owner-hotel-email">
          <Input
            id="owner-hotel-email"
            type="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
          />
        </Field>
      </div>

      <ImageUploader
        id="owner-hotel-images"
        label="Photos"
        required
        value={images}
        onChange={setImages}
        error={errors.images}
        hint="The first image is used as the cover photo. Files upload straight to storage."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create property'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
