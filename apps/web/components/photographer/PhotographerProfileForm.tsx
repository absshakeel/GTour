'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Input, Select, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { PhotographerDto } from '@gtour/utils';
import { fetchDestinationOptions } from '@/lib/owner-api';
import type { DestinationOption } from '@/lib/owner-api';
import { createMyPhotographer, updateMyPhotographer } from '@/lib/provider-api';
import type { PhotographerProfileInput } from '@/lib/provider-api';

interface FormState {
  name: string;
  bio: string;
  email: string;
  phone: string;
  destination_id: string;
}

function toFormState(photographer?: PhotographerDto | null): FormState {
  if (!photographer) {
    return { name: '', bio: '', email: '', phone: '', destination_id: '' };
  }

  return {
    name: photographer.name ?? '',
    bio: photographer.bio ?? '',
    email: photographer.email ?? '',
    phone: photographer.phone ?? '',
    destination_id:
      typeof photographer.destination_id === 'string'
        ? photographer.destination_id
        : (photographer.destination_id?._id ?? ''),
  };
}

/** Only storage URLs satisfy the profile schema; bundled `/images` paths are not sent back. */
function storageUrl(value?: string): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * Create or edit the signed-in photographer's public profile.
 *
 * The API derives the owner from the bearer token, so this form never sends an
 * id — that is what makes `POST /photographers` safe to expose to the provider.
 */
export default function PhotographerProfileForm({
  photographer,
  onSaved,
  onCancel,
}: {
  photographer?: PhotographerDto | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(photographer));
  const [avatar, setAvatar] = useState<string[]>(() => {
    const existing = storageUrl(photographer?.profile_image);
    return existing ? [existing] : [];
  });
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
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

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function validate(): PhotographerProfileInput | null {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    if (form.bio.trim().length > 500) next.bio = 'Keep the bio under 500 characters.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: form.name.trim(),
      bio: form.bio.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      destination_id: form.destination_id || undefined,
      profile_image: avatar[0],
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      if (photographer) {
        await updateMyPhotographer(photographer._id, payload);
      } else {
        await createMyPhotographer(payload);
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(photographer);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? 'Edit your profile' : 'Publish your photographer profile'}
      </h2>
      <p className="text-sm text-ink-500">
        Travellers see this on your public page together with your packages and portfolio.
      </p>

      {message ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="photographer-name" required error={errors.name}>
          <Input
            id="photographer-name"
            value={form.name}
            invalid={Boolean(errors.name)}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field
          label="Base destination"
          htmlFor="photographer-destination"
          error={errors.destination_id}
        >
          <Select
            id="photographer-destination"
            value={form.destination_id}
            onChange={(event) => update('destination_id', event.target.value)}
          >
            <option value="">Available for travel</option>
            {destinations.map((destination) => (
              <option key={destination._id} value={destination._id}>
                {destination.country
                  ? `${destination.name} — ${destination.country}`
                  : destination.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Bio" htmlFor="photographer-bio" error={errors.bio} hint="Up to 500 characters.">
        <Textarea
          id="photographer-bio"
          maxLength={500}
          value={form.bio}
          invalid={Boolean(errors.bio)}
          onChange={(event) => update('bio', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email" htmlFor="photographer-email" error={errors.email}>
          <Input
            id="photographer-email"
            type="email"
            value={form.email}
            invalid={Boolean(errors.email)}
            onChange={(event) => update('email', event.target.value)}
          />
        </Field>

        <Field label="Contact phone" htmlFor="photographer-phone">
          <Input
            id="photographer-phone"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </Field>
      </div>

      <ImageUploader
        id="photographer-avatar"
        label="Profile photo"
        single
        value={avatar}
        onChange={setAvatar}
        hint="Uploaded directly to storage. Shown on your public profile and cards."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save profile' : 'Publish profile'}
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
