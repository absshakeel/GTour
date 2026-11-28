import crypto from 'crypto';
import { getSslcommerz, isSslcommerzEnabled } from '../../config/sslcommerz';

/**
 * SSLCommerz IPN signature check.
 *
 * The gateway posts `verify_key` (a CSV naming the fields it signed) alongside
 * `verify_sign`. Recomputing that signature proves the body was produced by
 * someone holding the store password, which stops a forged IPN from marking a
 * booking paid.
 *
 * The algorithm is not documented in the v4 API reference, so it is reproduced
 * from the official SDKs (sslcommerz-python `hash_validate_ipn` and
 * sslcommerz-laravel `SSLCOMMERZ_hash_verify`), which agree byte for byte:
 *
 *   1. Read the field names listed in `verify_key`, in that listed order.
 *   2. Append `store_passwd` = md5(store password).
 *   3. Sort the pairs by key, ascending.
 *   4. Join as `key=value&...` and md5 the result.
 *
 * A test in `tests/paymentSignature.test.ts` pins this against the signature
 * published in the official Python SDK's own fixture.
 */

export interface SignatureCheck {
  /** Whether the recomputed signature matched the one supplied. */
  valid: boolean;
  /** Why the check failed, for logging. Never surfaced to the gateway. */
  reason?: string;
  /** Set when no store password is configured, so the check could not run. */
  skipped: boolean;
}

/** Escapes nothing: the gateway signs raw `key=value` pairs joined by `&`. */
function signParams(params: Record<string, string>, storePassword: string): string {
  const passwordHash = crypto.createHash('md5').update(storePassword).digest('hex');
  const signed: Record<string, string> = { ...params, store_passwd: passwordHash };

  const payload = Object.keys(signed)
    .sort()
    .map((key) => `${key}=${signed[key]}`)
    .join('&');

  return crypto.createHash('md5').update(payload).digest('hex');
}

/**
 * Verifies an IPN or return body against the store password.
 *
 * This is a secondary defence only. The authoritative question — did money
 * actually move? — is answered by order validation (`val_id`). A failure here
 * is logged and reported, but callers should still complete order validation so
 * a change to the undocumented algorithm cannot silently strand real payments.
 */
export function verifyGatewaySignature(body: Record<string, unknown>): SignatureCheck {
  const verifySign = typeof body.verify_sign === 'string' ? body.verify_sign.trim() : '';
  const verifyKey = typeof body.verify_key === 'string' ? body.verify_key.trim() : '';

  if (!verifySign || !verifyKey) {
    return { valid: false, reason: 'verify_sign or verify_key missing', skipped: false };
  }

  if (!isSslcommerzEnabled()) {
    return { valid: false, reason: 'store password not configured', skipped: true };
  }

  const { storePassword } = getSslcommerz();

  // The gateway lists the fields it signed in `verify_key`; the same list
  // arrives on every notification and excludes verify_sign/verify_key itself.
  const signedFields: Record<string, string> = {};
  for (const field of verifyKey.split(',')) {
    const name = field.trim();
    if (!name) continue;
    signedFields[name] = String(body[name] ?? '');
  }

  const expected = signParams(signedFields, storePassword);

  // Timing-safe compare: the signature is a secret-derived value.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(verifySign.toLowerCase(), 'utf8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  return valid
    ? { valid: true, skipped: false }
    : { valid: false, reason: 'signature mismatch', skipped: false };
}
