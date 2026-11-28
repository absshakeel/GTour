'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Select } from '@gtour/ui';
import { locationLabel, type DestinationDto } from '@gtour/utils';

/**
 * Destination selector for the provider directories.
 *
 * It only rewrites the URL: the API narrows the query server-side through
 * `?destination_id=`, so a filtered page stays shareable and cacheable.
 */
export default function DestinationFilter({
  destinations,
  value,
  label = 'Destination',
}: {
  destinations: DestinationDto[];
  value: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState(value);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = selected ? `?destination_id=${encodeURIComponent(selected)}` : '';
    router.push(`${pathname}${query}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-panel border border-ink-100/80 bg-white p-4 shadow-soft"
    >
      <label className="min-w-[16rem] flex-1" htmlFor="directory-destination">
        <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
          {label}
        </span>
        <Select
          id="directory-destination"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">All destinations</option>
          {destinations.map((destination) => {
            const region = locationLabel(destination.location_id);
            return (
              <option key={destination._id} value={destination._id}>
                {region ? `${destination.name} — ${region}` : destination.name}
              </option>
            );
          })}
        </Select>
      </label>

      <Button type="submit" size="sm">
        Apply
      </Button>

      {value ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected('');
            router.push(pathname);
          }}
        >
          Clear
        </Button>
      ) : null}
    </form>
  );
}
