'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Input, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { MyPhotographyServiceDto } from '@gtour/utils';
import { createPhotographyService, updatePhotographyService } from '@/lib/provider-api';

interface FormState {
  name: string;
  description: string;
  price_per_session: string;
  duration_hours: string;
  photo_count: string;
  delivery_days: string;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  price_per_session: '',
  duration_hours: '',
  photo_count: '',
  delivery_days: '',
};

function toFormState(service?: MyPhotographyServiceDto | null): FormState {
  if (!service) return EMPTY;

  return {
    name: service.name ?? '',
    description: service.description ?? '',
    price_per_session: String(service.price_per_session ?? ''),
    duration_hours: String(service.duration_hours ?? ''),
    photo_count: service.photo_count ? String(service.photo_count) : '',
    delivery_days: service.delivery_days ? String(service.delivery_days) : '',
  };
}

/** Field rules mirror `createPhotographyServiceSchema` so validation errors stay rare. */
export default function ServiceForm({
  service,
  onSaved,
  onCancel,
}: {
  service?: MyPhotographyServiceDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(service));
  const [images, setImages] = useState<string[]>(() => (service?.images ?? []).filter(Boolean));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'images', string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(service));
    setImages((service?.images ?? []).filter(Boolean));
    setErrors({});
    setMessage(null);
  }, [service]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function validate() {
    const next: Partial<Record<keyof FormState | 'images', string>> = {};
    const price = Number(form.price_per_session);
    const hours = Number(form.duration_hours);

    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    if (form.description.trim().length < 10)
      next.description = 'Describe the package in at least 10 characters.';
    if (!Number.isFinite(price) || price <= 0) next.price_per_session = 'Enter a price above zero.';
    if (!Number.isFinite(hours) || hours <= 0) next.duration_hours = 'Enter a duration above zero.';
    if (images.length < 1) next.images = 'Upload at least one image.';

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: form.name.trim(),
      description: form.description.trim(),
      price_per_session: price,
      duration_hours: hours,
      photo_count: form.photo_count ? Number(form.photo_count) : undefined,
      delivery_days: form.delivery_days ? Number(form.delivery_days) : undefined,
      images,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      if (service) {
        await updatePhotographyService(service._id, payload);
      } else {
        await createPhotographyService(payload);
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(service);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? `Edit ${service?.name}` : 'Add a photography package'}
      </h2>

      {message ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {message}
        </p>
      ) : null}

      <Field label="Package name" htmlFor="service-name" required error={errors.name}>
        <Input
          id="service-name"
          value={form.name}
          invalid={Boolean(errors.name)}
          onChange={(event) => update('name', event.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="service-description" required error={errors.description}>
        <Textarea
          id="service-description"
          value={form.description}
          invalid={Boolean(errors.description)}
          onChange={(event) => update('description', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Price per session (BDT)"
          htmlFor="service-price"
          required
          error={errors.price_per_session}
        >
          <Input
            id="service-price"
            type="number"
            min={1}
            value={form.price_per_session}
            invalid={Boolean(errors.price_per_session)}
            onChange={(event) => update('price_per_session', event.target.value)}
          />
        </Field>

        <Field
          label="Duration (hours)"
          htmlFor="service-duration"
          required
          error={errors.duration_hours}
        >
          <Input
            id="service-duration"
            type="number"
            min={1}
            step="0.5"
            value={form.duration_hours}
            invalid={Boolean(errors.duration_hours)}
            onChange={(event) => update('duration_hours', event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Edited photos" htmlFor="service-photo-count" hint="Optional.">
          <Input
            id="service-photo-count"
            type="number"
            min={1}
            value={form.photo_count}
            onChange={(event) => update('photo_count', event.target.value)}
          />
        </Field>

        <Field label="Delivery time (days)" htmlFor="service-delivery" hint="Optional.">
          <Input
            id="service-delivery"
            type="number"
            min={1}
            value={form.delivery_days}
            onChange={(event) => update('delivery_days', event.target.value)}
          />
        </Field>
      </div>

      <ImageUploader
        id="service-images"
        label="Package images"
        required
        value={images}
        onChange={setImages}
        error={errors.images}
        hint="The first image is used on your listing card."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save package' : 'Add package'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
