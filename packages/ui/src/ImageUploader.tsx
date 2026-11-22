'use client';

import { useCallback, useRef, useState } from 'react';
import { apiClient, cn, getApiErrorMessage } from '@gtour/utils';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

export interface ImageUploaderProps {
  /** Current image URLs — local `/images/...` paths or absolute object-store URLs. */
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Upload a single image without the cover/reorder affordances. */
  single?: boolean;
  disabled?: boolean;
}

function isImageKey(value: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(value);
}

/**
 * Direct-to-storage image uploader.
 *
 * Files are POSTed one at a time to `POST /uploads/image` (multipart, field
 * `file`, 10 MB ceiling, `image/*` only) and the returned public URL is appended
 * to `value`. Existing values — including local bundled `/images/*.jpg` paths —
 * render as thumbnails, never as raw URL text.
 */
export function ImageUploader({
  value,
  onChange,
  id = 'image-uploader',
  label = 'Images',
  hint,
  error,
  required,
  single = false,
  disabled,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const busy = uploading || disabled;

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length === 0 || disabled) return;

      setLocalError(null);

      const rejectedType = list.find((file) => !file.type.startsWith('image/'));
      if (rejectedType) {
        setLocalError(`"${rejectedType.name}" is not an image. Use JPG, PNG, WebP, GIF or AVIF.`);
        return;
      }

      const oversized = list.find((file) => file.size > MAX_BYTES);
      if (oversized) {
        setLocalError(`"${oversized.name}" is larger than 10 MB.`);
        return;
      }

      const selected = single ? list.slice(0, 1) : list;

      setUploading(true);
      setProgress({ done: 0, total: selected.length });

      const uploaded: string[] = [];
      try {
        for (const [index, file] of selected.entries()) {
          const form = new FormData();
          form.append('file', file);
          const { data } = await apiClient.post<{ success: boolean; url: string; key: string }>(
            '/uploads/image',
            form
          );
          if (data?.url) uploaded.push(data.url);
          setProgress({ done: index + 1, total: selected.length });
        }

        if (uploaded.length > 0) {
          onChange(single ? uploaded.slice(0, 1) : [...value.filter(Boolean), ...uploaded]);
        }
      } catch (err) {
        // Keep whatever already succeeded so the user does not lose work.
        if (uploaded.length > 0) onChange([...value.filter(Boolean), ...uploaded]);
        setLocalError(getApiErrorMessage(err));
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [disabled, onChange, single, value]
  );

  function removeAt(index: number) {
    const next = value.filter((_, position) => position !== index);
    onChange(next);
  }

  function makeCover(index: number) {
    if (index === 0) return;
    const next = [...value];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  }

  const message = error ?? localError;

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="block text-sm font-semibold tracking-[-0.01em] text-ink-800">
            {label}
            {required ? <span className="ml-0.5 text-terracotta-600">*</span> : null}
          </label>
          {!single ? (
            <span className="text-xs text-ink-400">
              {value.length} image{value.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!busy) upload(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-2xl border-2 border-dashed p-4 transition-colors duration-200 ease-premium sm:p-5',
          dragActive ? 'border-sea-500 bg-sea-50/70' : 'border-sand-300 bg-sand-50/60',
          message && 'border-terracotta-300 bg-terracotta-50/30'
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sea-600 shadow-sm ring-1 ring-sand-200">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16.5v1A2.5 2.5 0 0 0 6.5 20h11A2.5 2.5 0 0 0 20 17.5v-1M12 4v11m0-11 4 4m-4-4-4 4" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-800">
                {dragActive ? 'Drop to upload' : 'Drag & drop images here'}
              </p>
              <p className="text-xs text-ink-500">JPG, PNG, WebP, GIF or AVIF · up to 10 MB each</p>
            </div>
          </div>

          <label
            htmlFor={id}
            className={cn(
              'inline-flex min-h-[2.75rem] cursor-pointer items-center justify-center gap-2 rounded-pill px-5 text-sm font-semibold text-white transition-colors duration-200',
              busy ? 'bg-sea-400' : 'bg-sea-600 hover:bg-sea-700',
              disabled && 'cursor-not-allowed opacity-70'
            )}
          >
            <input
              ref={inputRef}
              id={id}
              type="file"
              accept={ACCEPTED}
              multiple={!single}
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                upload(event.target.files);
                event.target.value = '';
              }}
            />
            {uploading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {progress ? `Uploading ${progress.done}/${progress.total}` : 'Uploading'}
              </>
            ) : (
              <>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {value.length > 0 && single ? 'Replace image' : 'Choose files'}
              </>
            )}
          </label>
        </div>

        {value.length > 0 ? (
          <ul className={cn('mt-4 grid gap-3', single ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
            {value.map((src, index) => (
              <li
                key={`${src}-${index}`}
                className="group relative overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm"
              >
                {broken[src] || !isImageKey(src) ? (
                  <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-sand-100 px-2 text-center">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="m4 17 5-5 4 4 3-3 4 4" />
                    </svg>
                    <span className="text-[10px] font-medium text-ink-400">Preview unavailable</span>
                  </div>
                ) : (
                  // Arbitrary user-supplied hosts: plain <img> avoids next/image domain config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={single ? 'Uploaded image' : `Image ${index + 1}`}
                    className="h-28 w-full object-cover"
                    onError={() => setBroken((prev) => ({ ...prev, [src]: true }))}
                  />
                )}

                {!single && index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-md bg-sea-600/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Cover
                  </span>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent p-1.5">
                  {!single && index !== 0 ? (
                    <button
                      type="button"
                      onClick={() => makeCover(index)}
                      disabled={busy}
                      className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink-800 transition hover:bg-white disabled:opacity-50"
                    >
                      Set cover
                    </button>
                  ) : (
                    <span className="text-[10px] font-medium text-white/80">#{index + 1}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    disabled={busy}
                    aria-label={`Remove image ${index + 1}`}
                    className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-terracotta-700 transition hover:bg-white disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-sand-200 bg-white/70 px-4 py-5 text-center text-sm text-ink-500">
            No images yet — upload at least one.
          </p>
        )}
      </div>

      {message ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-terracotta-700">
          <span aria-hidden="true" className="mt-px">•</span>
          <span>{message}</span>
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}