'use client';

import { useEffect, useState } from 'react';
import { Button, Field, ImageUploader, Input, Textarea } from '@gtour/ui';
import { getApiErrorMessage } from '@gtour/utils';
import type { RoomDto } from '@gtour/utils';
import { createRoom, updateRoom } from '@/lib/owner-api';
import type { RoomInput } from '@/lib/owner-api';

interface FormState {
  room_type: string;
  bed_type: string;
  capacity: string;
  price_per_night: string;
  total_rooms: string;
  amenities: string;
}

const EMPTY: FormState = {
  room_type: '',
  bed_type: '',
  capacity: '2',
  price_per_night: '',
  total_rooms: '1',
  amenities: '',
};

function toFormState(room?: RoomDto | null): FormState {
  if (!room) return EMPTY;

  return {
    room_type: room.room_type ?? '',
    bed_type: room.bed_type ?? '',
    capacity: String(room.capacity ?? ''),
    price_per_night: String(room.price_per_night ?? ''),
    total_rooms: String(room.total_rooms ?? 1),
    amenities: (room.amenities ?? []).join('\n'),
  };
}

function toLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Create/edit form for a room type. `total_rooms` is the night-capacity the
 * booking engine reserves against, so it is required and must be at least 1.
 */
export default function RoomForm({
  hotelId,
  room,
  onSaved,
  onCancel,
}: {
  hotelId: string;
  room?: RoomDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(room));
  const [images, setImages] = useState<string[]>(() => (room?.images ?? []).filter(Boolean));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'images', string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(room));
    setImages((room?.images ?? []).filter(Boolean));
    setErrors({});
    setMessage(null);
  }, [room]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): Omit<RoomInput, 'hotel_id'> | null {
    const next: Partial<Record<keyof FormState | 'images', string>> = {};
    const capacity = Number(form.capacity);
    const price = Number(form.price_per_night);
    const totalRooms = Number(form.total_rooms);
    const amenities = toLines(form.amenities);

    if (form.room_type.trim().length < 2) next.room_type = 'Enter at least 2 characters.';
    if (form.bed_type.trim().length < 2) next.bed_type = 'Enter at least 2 characters.';
    if (!Number.isInteger(capacity) || capacity <= 0) next.capacity = 'Enter a whole number above 0.';
    if (!Number.isFinite(price) || price <= 0) next.price_per_night = 'Enter a nightly rate above 0.';
    if (!Number.isInteger(totalRooms) || totalRooms <= 0) next.total_rooms = 'Enter a whole number above 0.';
    if (amenities.length < 1) next.amenities = 'List at least one amenity.';
    if (images.length < 1) next.images = 'Upload at least one image.';

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      room_type: form.room_type.trim(),
      bed_type: form.bed_type.trim(),
      capacity,
      price_per_night: price,
      total_rooms: totalRooms,
      amenities,
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
      if (room) {
        await updateRoom(room._id, payload);
      } else {
        await createRoom({ ...payload, hotel_id: hotelId });
      }
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-card border border-ink-100/80 bg-sand-50/60 p-5"
      noValidate
    >
      <h3 className="font-display text-lg font-semibold text-ink-900">
        {room ? `Edit ${room.room_type}` : 'Add a room type'}
      </h3>

      {message ? (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room type" htmlFor="owner-room-type" required error={errors.room_type}>
          <Input
            id="owner-room-type"
            value={form.room_type}
            invalid={Boolean(errors.room_type)}
            placeholder="Deluxe double"
            onChange={(event) => update('room_type', event.target.value)}
          />
        </Field>

        <Field label="Bed type" htmlFor="owner-room-bed" required error={errors.bed_type}>
          <Input
            id="owner-room-bed"
            value={form.bed_type}
            invalid={Boolean(errors.bed_type)}
            placeholder="King"
            onChange={(event) => update('bed_type', event.target.value)}
          />
        </Field>

        <Field label="Sleeps" htmlFor="owner-room-capacity" required error={errors.capacity}>
          <Input
            id="owner-room-capacity"
            type="number"
            min={1}
            value={form.capacity}
            invalid={Boolean(errors.capacity)}
            onChange={(event) => update('capacity', event.target.value)}
          />
        </Field>

        <Field
          label="Nightly rate (BDT)"
          htmlFor="owner-room-price"
          required
          error={errors.price_per_night}
        >
          <Input
            id="owner-room-price"
            type="number"
            min={1}
            value={form.price_per_night}
            invalid={Boolean(errors.price_per_night)}
            onChange={(event) => update('price_per_night', event.target.value)}
          />
        </Field>

        <Field
          label="Rooms of this type"
          htmlFor="owner-room-total"
          required
          error={errors.total_rooms}
          hint="Bookings can never oversell this count."
        >
          <Input
            id="owner-room-total"
            type="number"
            min={1}
            value={form.total_rooms}
            invalid={Boolean(errors.total_rooms)}
            onChange={(event) => update('total_rooms', event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Amenities"
        htmlFor="owner-room-amenities"
        required
        error={errors.amenities}
        hint="One per line."
      >
        <Textarea
          id="owner-room-amenities"
          value={form.amenities}
          invalid={Boolean(errors.amenities)}
          onChange={(event) => update('amenities', event.target.value)}
        />
      </Field>

      <ImageUploader
        id="owner-room-images"
        label="Room photos"
        required
        value={images}
        onChange={setImages}
        error={errors.images}
        hint="The first image is used as the cover photo."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : room ? 'Save room' : 'Add room'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
