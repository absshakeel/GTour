'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@gtour/ui';
import { SESSION_EVENT, readUser } from '@gtour/utils';
import type { AuthUserDto } from '@gtour/utils';
import { roleHome, roleLabel } from '@/lib/role-home';

/**
 * The plan-this-trip card on a destination page.
 *
 * Auth state lives in `localStorage`, which a server component cannot see, so
 * the card is a client island: signed-out visitors get the registration pitch,
 * signed-in visitors get a route into their own workspace instead.
 */
export function DestinationCta({ destinationName }: { destinationName: string }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(readUser());
      setReady(true);
    };

    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!ready) {
    // Reserve the same footprint so the sidebar does not jump once the session
    // is known. Server-rendered visitors almost always land on the signed-out
    // branch, so this skeleton is only ever visible for a frame.
    return <div className="mt-8 h-52 rounded-panel border border-sea-200 bg-sea-100/40" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="mt-8 rounded-panel border border-sea-200 bg-sea-100/50 p-6">
        <h3 className="font-display text-xl font-semibold text-ink-900">Plan this trip with us</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Create a free account to keep your shortlist and booking details in one place.
          Availability and final pricing are always confirmed on the server.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/register">Create an account</ButtonLink>
          <ButtonLink href="/hotels" variant="outline">
            See stays
          </ButtonLink>
        </div>
      </div>
    );
  }

  const home = roleHome(user.role);

  return (
    <div className="mt-8 rounded-panel border border-sea-200 bg-sea-100/50 p-6">
      <h3 className="font-display text-xl font-semibold text-ink-900">
        Ready to plan {destinationName}?
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Signed in as {user.name || 'a member'} · {roleLabel(user.role)}. Pick up your shortlist,
        bookings and confirmations from your dashboard.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href={home}>Go to your dashboard</ButtonLink>
        <ButtonLink href="/hotels" variant="outline">
          See stays
        </ButtonLink>
      </div>
    </div>
  );
}