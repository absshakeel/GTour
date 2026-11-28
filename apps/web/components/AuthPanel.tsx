import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Frame for the short account-recovery pages.
 *
 * Sign-in and sign-up have their own full-bleed layouts because they are the
 * shop window; these pages are reached from an email and only ever need to show
 * one message and one action, so they share a small centred card instead.
 */
export function AuthPanel({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] w-full items-center justify-center bg-[#F8F3EA] px-5 py-12">
      <div className="w-full max-w-[30rem]">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-pill py-1 text-ink-900"
            aria-label="GTour home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sea-500 text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.5a15.9 15.9 0 00-1.2-3.1A8 8 0 0118.9 8zM12 4.2c.6.9 1.2 2 1.6 3.8H10.4c.4-1.8 1-2.9 1.6-3.8zM4.3 14a7.9 7.9 0 010-4h2.9a19.4 19.4 0 000 4zm.8 2h2.5c.3 1.1.7 2.2 1.2 3.1A8 8 0 015.1 16zm2.5-8H5.1a8 8 0 013.7-3.1A15.9 15.9 0 007.6 8zM12 19.8c-.6-.9-1.2-2-1.6-3.8h3.2c-.4 1.8-1 2.9-1.6 3.8zm1.9-5.8H10.1a17.4 17.4 0 010-4h3.8a17.4 17.4 0 010 4zm.6 5.1c.5-.9.9-2 1.2-3.1h2.5a8 8 0 01-3.7 3.1zm1.7-5.1a19.4 19.4 0 000-4h2.9a7.9 7.9 0 010 4z" />
              </svg>
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">GTour</span>
          </Link>
          <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sea-700">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink-900">
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
        </div>

        <div className="rounded-3xl border border-sand-200/80 bg-white/95 p-6 shadow-[0_24px_60px_-32px_rgba(12,28,44,0.4)] backdrop-blur-sm">
          {children}
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-ink-500">{footer}</div> : null}
      </div>
    </div>
  );
}
