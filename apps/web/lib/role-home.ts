/**
 * Single source of truth for "where does this role land after signing in".
 *
 * The admin application is a separate Next.js app, so admin accounts are sent
 * across origins instead of into a route on the public site.
 */
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';

export type UserRole = 'tourist' | 'hotel_owner' | 'photographer' | 'vehicle_provider' | 'admin';

const ROLE_HOME: Record<UserRole, string> = {
  tourist: '/dashboard',
  hotel_owner: '/dashboard/owner',
  photographer: '/dashboard/photographer',
  vehicle_provider: '/dashboard/vehicles',
  admin: ADMIN_URL,
};

export const ROLE_LABEL: Record<UserRole, string> = {
  tourist: 'Traveller',
  hotel_owner: 'Hotel owner',
  photographer: 'Photographer',
  vehicle_provider: 'Vehicle provider',
  admin: 'Administrator',
};

/** Destination after authentication. Unknown roles fall back to the traveller dashboard. */
export function roleHome(role?: string | null): string {
  if (role && role in ROLE_HOME) return ROLE_HOME[role as UserRole];
  return ROLE_HOME.tourist;
}

/** True when the role's home lives on the separate admin origin. */
export function isCrossOrigin(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function roleLabel(role?: string | null): string {
  if (role && role in ROLE_LABEL) return ROLE_LABEL[role as UserRole];
  return 'Member';
}