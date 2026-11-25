'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Select, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { MyPhotographyServiceDto, MyPortfolioDto } from '@gtour/utils';
import { createPortfolioEntry, updatePortfolioEntry } from '@/lib/provider-api';

/**
 * Portfolio entries hang off one package — the ERD stores one entry per service,
 * so the API upserts rather than duplicating when a set already exists.
 */
export default function PortfolioForm({
  entry,
  services,
  onSaved,
  onCancel,
}: {
  entry?: MyPortfolioDto | null;
  services: MyPhotographyServiceDto[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [serviceId, setServiceId] = useState(() => entry?.service_id ?? services[0]?._id ?? '');
  const [description, setDescription] = useState(() => entry?.description ?? '');
  const [images, setImages] = useState<string[]>(() => (entry?.images ?? []).filter(Boolean));
  const [errors, setErrors] = useState<{ images?: string; service_id?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setServiceId(entry?.service_id ?? services[0]?._id ?? '');
    setDescription(entry?.description ?? '');
    setImages((entry?.images ?? []).filter(Boolean));
    setErrors({});
    setMessage(null);
  }, [entry, services]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const next: { images?: string; service_id?: string } = {};
    if (!entry && !serviceId) next.service_id = 'Choose the package this set belongs to.';
    if (images.length < 1) next.images = 'Upload at least one image.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      if (entry) {
        await updatePortfolioEntry(entry._id, {
          description: description.trim() || undefined,
          images,
        });
      } else {
        await createPortfolioEntry({
          service_id: serviceId,
          description: description.trim() || undefined,
          images,
        });
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const editing = Boolean(entry);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-card border border-ink-100/80 bg-white p-6 shadow-soft"
    >
      <h2 className="font-display text-xl font-semibold text-ink-900">
        {editing ? 'Edit portfolio set' : 'Add a portfolio set'}
      </h2>

      {message ? (
        <p
          role="alert"
          className="rounded-2xl bg-terracotta-100/70 px-4 py-3 text-sm text-terracotta-700"
        >
          {message}
        </p>
      ) : null}

      {!editing ? (
        <Field
          label="Package"
          htmlFor="portfolio-service"
          required
          error={errors.service_id}
          hint="Each package keeps one gallery set."
        >
          <Select
            id="portfolio-service"
            value={serviceId}
            invalid={Boolean(errors.service_id)}
            onChange={(event) => setServiceId(event.target.value)}
          >
            <option value="">Select a package</option>
            {services.map((service) => (
              <option key={service._id} value={service._id}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Caption" htmlFor="portfolio-description" hint="Optional, up to 500 characters.">
        <Textarea
          id="portfolio-description"
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <ImageUploader
        id="portfolio-images"
        label="Gallery images"
        required
        value={images}
        onChange={setImages}
        error={errors.images}
        hint="Upload directly from your device. These appear in your public gallery."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save set' : 'Add set'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
