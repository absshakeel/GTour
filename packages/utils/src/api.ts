import axios, { type AxiosInstance } from 'axios';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5051/api/v1';

/**
 * Shared axios instance for the Express API.
 * The API wraps payloads as `{ success, ... }` and errors as
 * `{ success: false, error: { message, code, details } }`.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('gtour.token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // Let the browser/axios set the multipart boundary for FormData uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers) {
      delete (config.headers as any)['Content-Type'];
      delete (config.headers as any)['content-type'];
    }
  }

  return config;
});

/** Flattens zod's `{fieldErrors, formErrors}` details into a readable sentence. */
function describeFieldErrors(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;

  const { fieldErrors, formErrors } = details as {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };

  const messages = [
    ...(formErrors ?? []),
    ...Object.entries(fieldErrors ?? {}).flatMap(([field, errors]) =>
      (errors ?? []).map((error) => `${field}: ${error}`)
    ),
  ].filter(Boolean);

  return messages.length > 0 ? messages.slice(0, 3).join(', ') : null;
}

/** Extract a human-readable message from any thrown value. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { error?: { message?: string; details?: unknown }; message?: string }
      | undefined;

    const base = payload?.error?.message ?? payload?.message ?? error.message;
    // Validation failures carry field-level details that are far more useful
    // than the generic top-level message.
    const detail = describeFieldErrors(payload?.error?.details);

    if (base && detail) return `${base}: ${detail}`;
    return base ?? detail ?? 'Something went wrong. Please try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
