'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { VehicleProviderDto } from '@gtour/utils';
import { createMyVehicleProvider, updateMyVehicleProvider } from '@/lib/provider-api';
import type { VehicleProviderInput } from '@/lib/provider-api';
import { fetchDestinationOptions } from '@/lib/owner-api';
import type { DestinationOption } from '@/lib/owner-api';

/** Creates or renames the signed-in account's rental business profile. */
export default function VehicleProviderProfileForm({
  provider,
  onSaved,
  onCancel,
}: {
  provider?: VehicleProviderDto | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    name: provider?.name ?? '',
    email: provider?.email ?? '',
    phone: provider?.phone ?? '',
    description: provider?.description ?? '',
    destination_id:
      typeof provider?.destination_id === 'string'
        ? provider.destination_id
        : (provider?.destination_id?._id ?? ''),
  });
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
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

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function validate(): VehicleProviderInput | null {
    const next: Partial<Record<keyof typeof form, string>> = {};

    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (form.description.trim().length > 500) {
      next.description = 'Keep the description under 500 characters.';
    }
    // A brand-new business must claim a base destination; the API requires it.
    if (!provider && !form.destination_id) {
      next.destination_id = 'Choose the destination you operate in.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      description: form.description.trim() || undefined,
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
      if (provider) {
        await updateMyVehicleProvider(provider._id, payload);
      } else {
        await createMyVehicleProvider(payload);
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(provider);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? 'Edit your rental business' : 'Create your rental business'}
      </h2>
      <p className="text-sm text-ink-500">Travellers see this name on every vehicle you publish.</p>

      {message ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {message}
        </p>
      ) : null}

      <Field label="Business name" htmlFor="provider-name" required error={errors.name}>
        <Input
          id="provider-name"
          value={form.name}
          invalid={Boolean(errors.name)}
          onChange={(event) => update('name', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email" htmlFor="provider-email" error={errors.email}>
          <Input
            id="provider-email"
            type="email"
            value={form.email}
            invalid={Boolean(errors.email)}
            onChange={(event) => update('email', event.target.value)}
          />
        </Field>
        <Field label="Contact phone" htmlFor="provider-phone">
          <Input
            id="provider-phone"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Base destination"
        htmlFor="provider-destination"
        required={!provider}
        error={errors.destination_id}
        hint="Where you operate. Your vehicles are listed here unless you set a different one."
      >
        <Select
          id="provider-destination"
          value={form.destination_id}
          invalid={Boolean(errors.destination_id)}
          onChange={(event) => update('destination_id', event.target.value)}
        >
          <option value="">Select a destination</option>
          {destinations.map((destination) => (
            <option key={destination._id} value={destination._id}>
              {destination.country
                ? `${destination.name} — ${destination.country}`
                : destination.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Description"
        htmlFor="provider-description"
        error={errors.description}
        hint="What you rent, where you operate and what is included."
      >
        <Textarea
          id="provider-description"
          maxLength={500}
          value={form.description}
          invalid={Boolean(errors.description)}
          onChange={(event) => update('description', event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save business' : 'Create business'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
