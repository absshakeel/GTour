import {
  BookingStatus,
  GatewayProvider,
  PaymentPolicy,
  PaymentStatus,
  RefundStatus,
} from '@gtour/shared-types';
import Booking from '../../models/Booking';
import User from '../../models/User';
// Registered for `describeStay`/`describeProduct`, which reach them through
// `Booking.db.model(...)` and so never import them directly.
import '../../models/Hotel';
import '../../models/Destination';
import Payment, { IPayment } from '../../models/Payment';
import { ApiError } from '../../utils/ApiError';
import { apiUrl } from '../../config/appUrls';
import { activeProvider, isSslcommerzEnabled } from '../../config/sslcommerz';
import { currencyCode } from '../../config/currency';
import {
  addMinor,
  compareMinor,
  formatMinorGrouped,
  fromMinor,
  subMinor,
  toMinor,
} from '../../utils/money';
import { refundReference, transactionReference } from '../../utils/reference';
import { ensureInvoice } from './invoice.service';
import { sendPaymentNotice } from './notification.service';
import { loadBookingContext } from '../notification/bookingContext.service';
import { notify } from '../notification/notify.service';
import { paymentNotice } from '../notification/paymentTemplates.service';
import { NotificationType } from '@gtour/shared-types';
import { canManageBooking, isAdmin, type Caller } from '../bookingAccess.service';
import type {
  CreateCheckoutResult,
  ProviderChannel,
  ValidatedPayment,
} from './provider';
import { getProvider } from './registry';
import { assertRefundTransition, assertTransition } from './statusMachine';
import { verifyGatewaySignature } from './signature';

/**
 * The payment lifecycle: everything that ties the payment gateway to our own
 * booking and payment records.
 *
 * Two rules shape this file:
 *
 *  - **Never trust the browser.** A redirect back from the gateway only says the
 *    customer reached a page. Money is confirmed exclusively through order
 *    validation (`val_id`), which the gateway answers server to server. The IPN
 *    and the return handler therefore share one code path.
 *  - **Never trust the amount.** The authoritative figure is the booking's
 *    stored `price_snapshot`, written when the booking was created. Whatever the
 *    gateway echoes back is cross-checked against it and rejected on mismatch.
 */

/** Booking states a payment may be collected for. */
const PAYABLE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

/**
 * The policy a legacy booking (created before policies existed) is treated as.
 * Confirm-then-pay is the safe reading: it never asks for money early.
 */
const DEFAULT_PAYMENT_POLICY = PaymentPolicy.PAY_ON_CONFIRMATION;

/**
 * Enforces the property's payment policy against the booking's current state.
 *
 * Admins are exempt: recording an offline settlement after the fact has to stay
 * possible regardless of what the property's policy says.
 */
function assertPolicyAllowsPayment(
  booking: { status: BookingStatus; payment_policy?: PaymentPolicy },
  caller: Caller,
): void {
  if (isAdmin(caller)) return;

  const { allowed, reason } = paymentAvailability(booking);
  if (!allowed) {
    throw new ApiError(reason!, 409, 'PAYMENT_NOT_ALLOWED');
  }
}

export interface CheckoutSession {
  paymentId: string;
  tranId: string;
  amountMinor: number;
  currency: string;
  gatewayPageUrl: string;
  sessionKey: string;
  channels: ProviderChannel[];
  gateway: GatewayProvider;
}

export interface NotificationOutcome {
  /** `applied` means this call moved the payment; `noop` means it was a replay. */
  result: 'applied' | 'noop' | 'failed' | 'cancelled' | 'expired' | 'ignored';
  paymentId?: string;
  /**
   * The booking this payment settles. The return route redirects the customer
   * with this id rather than `paymentId`, because the web page it lands on
   * reads booking-scoped endpoints.
   */
  bookingId?: string;
  status?: PaymentStatus;
  reason?: string;
}

/**
 * The amount a booking may be charged, read from stored data only.
 *
 * `price_snapshot` is written once at booking time and never rewritten, so a
 * later room price change cannot alter what the guest pays. `total_amount` is
 * the fallback for rows created before the snapshot existed.
 */
export function payableAmount(booking: {
  total_amount: number;
  price_snapshot?: { total?: number; currency?: string } | null;
}): { amountMinor: number; amount: number; currency: string } {
  const currency = booking.price_snapshot?.currency || currencyCode();
  const amount = booking.price_snapshot?.total ?? booking.total_amount;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError('Booking has no payable amount', 409, 'BOOKING_NOT_PAYABLE');
  }

  return { amountMinor: toMinor(amount, currency), amount, currency };
}

/** Loads a booking and asserts the caller is allowed to pay for it. */
async function loadPayableBooking(caller: Caller, bookingId: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  const isGuest = String(booking.user_id) === caller.userId;
  if (!isGuest && !isAdmin(caller)) {
    throw new ApiError('You can only pay for your own booking', 403, 'FORBIDDEN');
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new ApiError('A cancelled booking cannot be paid', 409, 'BOOKING_CANCELLED');
  }

  if (!PAYABLE_BOOKING_STATUSES.includes(booking.status)) {
    throw new ApiError(
      `A booking in status ${booking.status} cannot be paid`,
      409,
      'BOOKING_NOT_PAYABLE',
    );
  }

  if (booking.status === BookingStatus.COMPLETED) {
    // Allowing this keeps offline settlement working for a stay that already
    // finished, which the manual rail relies on.
    return booking;
  }

  return booking;
}

/** Whether the property's policy permits collecting money right now. */
export function paymentAvailability(booking: {
  status: BookingStatus;
  payment_policy?: PaymentPolicy;
}): { allowed: boolean; policy: PaymentPolicy; reason?: string } {
  const policy = booking.payment_policy ?? DEFAULT_PAYMENT_POLICY;

  if (policy === PaymentPolicy.PAY_ON_ARRIVAL) {
    return {
      allowed: false,
      policy,
      reason: 'This property is settled on arrival, so no online payment is needed',
    };
  }

  if (policy === PaymentPolicy.PAY_ON_CONFIRMATION && booking.status === BookingStatus.PENDING) {
    return {
      allowed: false,
      policy,
      reason: 'Payment opens once the property accepts your request',
    };
  }

  return { allowed: true, policy };
}

/**
 * The stay facts the gateway's `travel-vertical` profile validates.
 *
 * The hotel name and city are read from the booking's own hotel and its
 * destination rather than trusted from the browser, because the gateway refuses
 * the session outright when `hotel_name`, `length_of_stay`, `check_in_time` or
 * `hotel_city` is missing.
 */
async function describeStay(booking: {
  hotel_id?: unknown;
  start_date?: Date | null;
  end_date?: Date | null;
  room_count?: number;
}): Promise<{ hotelName: string; city: string; nights: number; rooms: number } | null> {
  if (!booking.hotel_id) return null;

  const hotel = await Booking.db
    .model('Hotel')
    .findById(booking.hotel_id)
    .select('name destination_id')
    .lean<{ name?: string; destination_id?: unknown } | null>();

  let city = '';
  if (hotel?.destination_id) {
    const destination = await Booking.db
      .model('Destination')
      .findById(hotel.destination_id)
      .select('name')
      .lean<{ name?: string } | null>();
    city = destination?.name ?? '';
  }

  return {
    hotelName: hotel?.name ?? '',
    city,
    nights: stayLength(booking.start_date, booking.end_date) ?? 1,
    rooms: Math.max(1, booking.room_count ?? 1),
  };
}

/**
 * A short, customer-facing label for the gateway's hosted page.
 *
 * Takes the hotel name from `describeStay` so a booking only costs one hotel
 * lookup rather than two.
 */
function describeProduct(
  booking: { booking_type: string; booking_reference: string },
  hotelName?: string,
): { name: string; hotelName?: string } {
  if (hotelName) return { name: `Hotel stay — ${hotelName}`, hotelName };
  return { name: `${booking.booking_type} booking ${booking.booking_reference}` };
}

/**
 * Customer identity for the hosted page.
 *
 * SSLCommerz requires a name and an email on every session, but the browser is
 * not allowed to supply them: they are read from the account that owns the
 * booking, falling back to the caller. The optional overrides let a caller pass
 * a contact address that differs from the account's.
 */
async function describeCustomer(
  booking: { user_id?: unknown },
  caller: Caller,
  overrides: { email?: string; name?: string },
): Promise<{ email: string; name: string }> {
  const providedEmail = overrides.email?.trim();
  const providedName = overrides.name?.trim();

  let owner: { name?: string; email?: string } | null = null;
  if (booking.user_id && (!providedEmail || !providedName)) {
    owner = await User.findById(booking.user_id)
      .select('name email')
      .lean<{ name?: string; email?: string } | null>();
  }

  return {
    email: providedEmail || owner?.email || `${caller.userId}@gtour.local`,
    name: providedName || owner?.name || caller.userId,
  };
}

/** Nights between two dates, at least 1 — the gateway's travel profile wants it. */
function stayLength(start?: Date | null, end?: Date | null): number | undefined {
  if (!start || !end) return undefined;
  const nights = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
  return nights > 0 ? nights : 1;
}

/**
 * Opens a hosted checkout for a booking.
 *
 * Reuses the existing payment row when there is one so a retry does not violate
 * the one-payment-per-booking rule; each attempt is recorded as its own entry in
 * `transactions`, which is what makes a resume-after-abandonment link possible.
 */
export async function initiateCheckout(
  caller: Caller,
  bookingId: string,
  options: {
    gateway?: GatewayProvider;
    customerEmail?: string;
    customerName?: string;
  },
): Promise<CheckoutSession> {
  if (!isSslcommerzEnabled()) {
    throw new ApiError(
      'No payment gateway is configured. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWD.',
      503,
      'GATEWAY_NOT_CONFIGURED',
    );
  }

  const booking = await loadPayableBooking(caller, bookingId);
  assertPolicyAllowsPayment(booking, caller);
  const { amountMinor, amount, currency } = payableAmount(booking);

  const provider = options.gateway ? getProvider(options.gateway) : getProvider(activeProvider());
  const tranId = transactionReference();

  const existing = await Payment.findOne({ booking_id: booking._id });

  // Money already settled must never be charged again; a second checkout on a
  // paid booking is a user error, not a retry.
  if (existing && [PaymentStatus.SUCCESSFUL, PaymentStatus.COMPLETED].includes(existing.payment_status)) {
    throw new ApiError('This booking is already paid', 409, 'ALREADY_PAID');
  }
  if (existing && existing.payment_status === PaymentStatus.REFUNDED) {
    throw new ApiError('This booking was refunded and cannot be paid again', 409, 'ALREADY_REFUNDED');
  }

  const stay = await describeStay(booking);
  const product = describeProduct(booking, stay?.hotelName);
  const customer = await describeCustomer(booking, caller, {
    email: options.customerEmail,
    name: options.customerName,
  });

  const payment =
    existing ||
    new Payment({
      booking_id: booking._id,
      amount,
      amount_minor: amountMinor,
      currency,
      payment_method: provider.name,
      payment_status: PaymentStatus.PENDING,
      gateway: provider.name,
      initiated_by: caller.userId,
    });

  // Keep the stored amount aligned with the snapshot on a retry: the booking
  // price is authoritative, so a stale row is corrected rather than trusted.
  payment.amount = amount;
  payment.amount_minor = amountMinor;
  payment.currency = currency;
  payment.gateway = provider.name;
  payment.initiated_by = caller.userId as unknown as IPayment['initiated_by'];

  payment.transactions.push({
    tran_id: tranId,
    provider: provider.name,
    amount_minor: amountMinor,
    currency,
    status: PaymentStatus.PENDING,
    initiated_at: new Date(),
  } as never);

  payment.events.push({
    type: 'checkout_initiated',
    from_status: existing?.payment_status ?? PaymentStatus.PENDING,
    to_status: PaymentStatus.PROCESSING,
    source: 'system',
    actor_id: caller.userId,
    message: `Hosted checkout started via ${provider.name}`,
    metadata: { tran_id: tranId, amount_minor: amountMinor, currency },
  } as never);

  payment.payment_status = PaymentStatus.PROCESSING;
  await payment.save();

  // The path the *browser* should be sent to after checkout. The gateway's own
  // copy of it needs the `/api/v1` mount prefix on top (see below).
  const returnPath = `/payments/return/${payment._id}`;
  let checkout: CreateCheckoutResult;
  try {
    checkout = await provider.createCheckout({
      tranId,
      amountMinor,
      currency,
      customerName: customer.name,
      customerEmail: customer.email,
      productName: product.name,
      productCategory: booking.booking_type,
      // `gateway.routes` is mounted under `/api/v1`, so the URLs handed to
      // SSLCommerz must carry that prefix or the gateway navigates the customer
      // to an unregistered path and the payment is never settled.
      successUrl: apiUrl(`/api/v1${returnPath}?outcome=success`),
      failUrl: apiUrl(`/api/v1${returnPath}?outcome=fail`),
      cancelUrl: apiUrl(`/api/v1${returnPath}?outcome=cancel`),
      ipnUrl: apiUrl('/api/v1/payments/ipn'),
      // Echoed back on both the return and the IPN, so a notification can be
      // matched to our records even if `tran_id` ever has to be regenerated.
      metadata: {
        value_a: String(payment._id),
        value_b: String(booking._id),
        value_c: booking.booking_reference,
        value_d: caller.userId,
      },
      travel: stay
        ? {
            hotelName: stay.hotelName || product.name,
            nights: stay.nights,
            rooms: stay.rooms,
            city: stay.city,
          }
        : undefined,
    });
  } catch (error) {
    // The attempt is recorded as failed so the tourist sees why and can retry.
    const transaction = payment.transactions.find((entry) => entry.tran_id === tranId);
    if (transaction) {
      transaction.status = PaymentStatus.FAILED;
      transaction.failure_reason =
        error instanceof Error ? error.message.slice(0, 300) : 'Checkout could not be created';
    }
    payment.payment_status = PaymentStatus.FAILED;
    payment.events.push({
      type: 'checkout_failed',
      to_status: PaymentStatus.FAILED,
      source: 'gateway',
      message: transaction?.failure_reason,
      metadata: { tran_id: tranId },
    } as never);
    await payment.save();
    throw error;
  }

  const transaction = payment.transactions.find((entry) => entry.tran_id === tranId);
  if (transaction) {
    transaction.sessionkey = checkout.sessionKey;
    transaction.gateway_page_url = checkout.gatewayPageUrl;
  }
  await payment.save();

  return {
    paymentId: String(payment._id),
    tranId,
    amountMinor,
    currency,
    gatewayPageUrl: checkout.gatewayPageUrl,
    sessionKey: checkout.sessionKey,
    channels: checkout.channels,
    gateway: provider.name,
  };
}

/**
 * Where the customer's browser should land after a completed checkout.
 *
 * Keyed by *booking* id, not payment id: the web page this points at reads the
 * booking's payment and checkout quote, so a payment id would 404 there. The
 * gateway's own callback URL is the API route, built separately in
 * `initiateCheckout`.
 */
export function returnPathFor(bookingId: string, outcome: 'success' | 'fail' | 'cancel'): string {
  const query = new URLSearchParams({ outcome });
  return `/payments/return/${bookingId}?${query.toString()}`;
}

/** True when the gateway reports an attempt that never produced a `val_id`. */
function isTerminalGatewayStatus(gatewayStatus: string): boolean {
  return ['FAILED', 'CANCELLED', 'EXPIRED', 'UNATTEMPTED'].includes(gatewayStatus);
}

/** The gateway's statuses for a transaction that never became valid. */
function terminalStatusFor(gatewayStatus: string): PaymentStatus {
  switch (gatewayStatus.toUpperCase()) {
    case 'CANCELLED':
      return PaymentStatus.CANCELLED;
    case 'EXPIRED':
      return PaymentStatus.EXPIRED;
    case 'FAILED':
    case 'UNATTEMPTED':
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.PENDING;
  }
}

/**
 * Writes the gateway's validated transaction facts onto our own records.
 * Kept separate from status handling so both the IPN and the return path apply
 * exactly the same detail.
 */
function recordValidatedTransaction(
  payment: IPayment,
  tranId: string,
  validated: ValidatedPayment,
  currency: string,
): void {
  const transaction =
    payment.transactions.find((entry) => entry.tran_id === tranId) ??
    payment.transactions.find((entry) => entry.val_id === validated.valId);

  if (!transaction) return;

  transaction.val_id = validated.valId;
  transaction.bank_tran_id = validated.bankTranId;
  transaction.store_amount_minor = validated.storeAmountMinor;
  transaction.currency_type = validated.currencyType;
  transaction.currency_amount_minor = validated.currencyAmountMinor;
  transaction.currency_rate = validated.currencyRate;
  transaction.card_brand = validated.cardBrand;
  transaction.card_type = validated.cardType;
  transaction.card_issuer = validated.cardIssuer;
  transaction.card_issuer_country = validated.cardIssuerCountry;
  transaction.card_mask = validated.cardMask;
  transaction.risk_level = validated.riskLevel;
  transaction.risk_title = validated.riskTitle;
  transaction.validated_at = new Date();
  transaction.payload = { ...validated.raw, currency: currency || validated.currency };
}

/**
 * The single place a gateway notification becomes a payment state change.
 *
 * `payload` is the raw form body — from the IPN listener or from the customer's
 * return redirect. Both are untrusted, so the sequence is:
 *
 *   1. Resolve our own payment from `tran_id` / echoed `value_*`.
 *   2. Reject anything that is not an SSLCommerz body for a transaction we know.
 *   3. Cross-check the echoed amount and currency against our stored figure.
 *   4. Ask the gateway to validate `val_id` — only this answer moves money.
 *   5. Apply a legal status transition, treating a replay as a no-op.
 */
export async function processGatewayNotification(
  payload: Record<string, unknown>,
  source: 'gateway' | 'system' = 'gateway',
): Promise<NotificationOutcome> {
  const tranId = typeof payload.tran_id === 'string' ? payload.tran_id.trim() : '';
  const valId = typeof payload.val_id === 'string' ? payload.val_id.trim() : '';
  const gatewayStatus = (typeof payload.status === 'string' ? payload.status : '').toUpperCase();

  const payment = await findPaymentForNotification(tranId, payload);
  if (!payment) return { result: 'ignored', reason: 'unknown transaction' };

  const signature = verifyGatewaySignature(payload);
  if (!signature.valid && !signature.skipped) {
    await recordEvent(payment, {
      type: 'signature_rejected',
      source,
      message: signature.reason,
      metadata: { tran_id: tranId, val_id: valId, status: gatewayStatus },
    });
    return {
      result: 'ignored',
      paymentId: String(payment._id),
      bookingId: String(payment.booking_id),
      reason: 'signature rejected',
    };
  }

  // A notification that reports a failed attempt needs no order validation —
  // no money exists to validate. It still has to be recorded and applied.
  if (!valId || isTerminalGatewayStatus(gatewayStatus)) {
    const next = terminalStatusFor(gatewayStatus || 'FAILED');
    return applyOutcome(payment, {
      next,
      source,
      tranId,
      message: `Gateway reported ${gatewayStatus || 'FAILED'}`,
      metadata: { bank_tran_id: payload.bank_tran_id, reason: payload.error },
    });
  }

  const provider = payment.gateway === GatewayProvider.MANUAL
    ? getProvider(activeProvider())
    : getProvider(payment.gateway);

  const validated = await provider.validate(valId);

  if (validated.status === 'invalid') {
    return applyOutcome(payment, {
      next: PaymentStatus.FAILED,
      source,
      tranId,
      message: validated.failureReason || 'Gateway rejected the transaction',
      metadata: { val_id: valId },
    });
  }

  if (validated.status === 'pending' || validated.status === 'unknown') {
    await recordEvent(payment, {
      type: 'validation_pending',
      source,
      message: `Gateway returned status ${validated.status}`,
      metadata: { tran_id: tranId, val_id: valId },
    });
    return {
      result: 'noop',
      paymentId: String(payment._id),
      bookingId: String(payment.booking_id),
      status: payment.payment_status,
    };
  }

  // Amount cross-check. The gateway validates that money moved; we independently
  // confirm it moved for the amount we expected, so a mixed-up or replayed
  // `val_id` cannot settle a booking at the wrong price.
  const amountMismatch = assertAmountMatches(payment, validated);
  if (amountMismatch) {
    await recordEvent(payment, {
      type: 'amount_mismatch',
      source,
      message: amountMismatch,
      metadata: { tran_id: tranId, val_id: valId },
    });
    return {
      result: 'ignored',
      paymentId: String(payment._id),
      bookingId: String(payment.booking_id),
      reason: amountMismatch,
    };
  }

  recordValidatedTransaction(payment, tranId, validated, payment.currency);

  // `already_validated` means the gateway has seen this `val_id` before, which
  // is exactly what a duplicate IPN looks like. Treating it as a failure would
  // mark a genuinely paid booking as failed, so it is a success that changes
  // nothing if already applied.
  const alreadyApplied = payment.payment_status === PaymentStatus.SUCCESSFUL;
  const outcome = await applyOutcome(payment, {
    next: PaymentStatus.SUCCESSFUL,
    source,
    tranId,
    message: validated.status === 'already_validated'
      ? 'Payment confirmed (gateway replay)'
      : 'Payment confirmed by gateway',
    metadata: {
      val_id: validated.valId,
      bank_tran_id: validated.bankTranId,
      card_brand: validated.cardBrand,
      card_mask: validated.cardMask,
      risk_level: validated.riskLevel,
    },
    skipIfCurrent: alreadyApplied,
  });

  return outcome;
}

/** Matches a notification to our payment, preferring the internal id echo. */
async function findPaymentForNotification(
  tranId: string,
  payload: Record<string, unknown>,
): Promise<IPayment | null> {
  if (tranId) {
    const byTranId = await Payment.findOne({ 'transactions.tran_id': tranId });
    if (byTranId) return byTranId;
  }

  // `value_a` carries our payment id and `value_b` the booking id; either is
  // sufficient to resolve the record when the transaction array lookup misses.
  for (const key of ['value_a', 'value_b'] as const) {
    const value = typeof payload[key] === 'string' ? (payload[key] as string).trim() : '';
    if (value && /^[a-f0-9]{24}$/i.test(value)) {
      const query = key === 'value_a' ? { _id: value } : { booking_id: value };
      const found = await Payment.findOne(query);
      if (found) return found;
    }
  }

  return null;
}

/** Returns a message when the gateway's amount disagrees with ours, else null. */
function assertAmountMatches(payment: IPayment, validated: ValidatedPayment): string | null {
  const currency = validated.currency || payment.currency;

  if (validated.amountMinor !== undefined && compareMinor(validated.amountMinor, payment.amount_minor) !== 0) {
    return `Gateway amount ${formatMinorGrouped(validated.amountMinor, currency)} does not match the booked ${formatMinorGrouped(payment.amount_minor, payment.currency)}`;
  }

  // A converted charge is legitimate: SSLCommerz settles BDT and reports the
  // customer's currency separately, so only a currency mismatch on the settled
  // amount is a genuine concern.
  if (validated.currency && validated.currency !== payment.currency) {
    return `Gateway currency ${validated.currency} does not match the booked ${payment.currency}`;
  }

  return null;
}

interface OutcomeInput {
  next: PaymentStatus;
  source: 'gateway' | 'system' | 'admin' | 'provider';
  tranId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** When the payment is already in this state, do not write anything. */
  skipIfCurrent?: boolean;
  actorId?: string;
}

/**
 * Applies a status change, or reports the change as already made.
 *
 * Replays are the normal case on the notification path — SSLCommerz retries an
 * IPN it has not had a 2xx for, and a customer can revisit the success page —
 * so a duplicate must be harmless.
 */
async function applyOutcome(payment: IPayment, input: OutcomeInput): Promise<NotificationOutcome> {
  const from = payment.payment_status;

  if (from === input.next || (input.skipIfCurrent && input.next === PaymentStatus.SUCCESSFUL)) {
    await recordEvent(payment, {
      type: 'duplicate_notification',
      source: input.source,
      message: `Already ${from}`,
      metadata: { tran_id: input.tranId },
    });
    return {
      result: 'noop',
      paymentId: String(payment._id),
      bookingId: String(payment.booking_id),
      status: from,
    };
  }

  try {
    assertTransition(from, input.next);
  } catch {
    // An illegal move means a stale notification (a failure arriving after a
    // success, say). Recording it and stopping is safer than forcing the state.
    await recordEvent(payment, {
      type: 'transition_rejected',
      source: input.source,
      message: `Refused ${from} to ${input.next}`,
      metadata: { tran_id: input.tranId },
    });
    return {
      result: 'ignored',
      paymentId: String(payment._id),
      bookingId: String(payment.booking_id),
      reason: `illegal transition from ${from}`,
    };
  }

  payment.payment_status = input.next;

  if (input.next === PaymentStatus.SUCCESSFUL) {
    payment.payment_date = new Date();
    payment.transaction_reference = input.tranId ?? payment.transaction_reference;
  }

  const transaction = input.tranId
    ? payment.transactions.find((entry) => entry.tran_id === input.tranId)
    : undefined;
  if (transaction) {
    transaction.status = input.next;
    if (input.next === PaymentStatus.SUCCESSFUL) transaction.completed_at = new Date();
    if (input.next === PaymentStatus.FAILED && typeof input.metadata?.reason === 'string') {
      transaction.failure_reason = input.metadata.reason as string;
    }
  }

  payment.events.push({
    type: input.next === PaymentStatus.SUCCESSFUL ? 'payment_captured' : `payment_${input.next}`,
    from_status: from,
    to_status: input.next,
    source: input.source,
    actor_id: input.actorId,
    message: input.message,
    metadata: input.metadata,
  } as never);

  await payment.save();

  const result =
    input.next === PaymentStatus.SUCCESSFUL
      ? 'applied'
      : input.next === PaymentStatus.FAILED
        ? 'failed'
        : input.next === PaymentStatus.CANCELLED
          ? 'cancelled'
          : input.next === PaymentStatus.EXPIRED
            ? 'expired'
            : 'applied';

  await dispatchNotices(payment);

  return {
    result,
    paymentId: String(payment._id),
    bookingId: String(payment.booking_id),
    status: input.next,
  };
}

async function recordEvent(
  payment: IPayment,
  event: {
    type: string;
    source: OutcomeInput['source'];
    message?: string;
    metadata?: Record<string, unknown>;
    from?: PaymentStatus;
    to?: PaymentStatus;
  },
): Promise<void> {
  payment.events.push({
    type: event.type,
    from_status: event.from,
    to_status: event.to,
    source: event.source,
    message: event.message,
    metadata: event.metadata,
  } as never);
  await payment.save();
}

/**
 * Raises the invoice and emails the guest for a payment change.
 *
 * Wrapped and awaited rather than fired and forgotten: the invoice number is
 * written back onto the payment, and a floating promise would race the response.
 * It cannot break the caller, though — a failure here is recorded as an event so
 * the money movement it describes is never reported as failed.
 */
async function dispatchNotices(payment: IPayment): Promise<void> {
  try {
    if (payment.payment_status === PaymentStatus.SUCCESSFUL) {
      await ensureInvoice(payment);
    }

    const kind =
      payment.payment_status === PaymentStatus.SUCCESSFUL
        ? 'payment_received'
        : payment.payment_status === PaymentStatus.FAILED
          ? 'payment_failed'
          : null;

    if (!kind) return;

    await recordDelivery(payment, await sendPaymentNotice(payment, kind, failureDetail(payment)));

    await recordPaymentNotification(payment, kind, failureDetail(payment));
  } catch (error) {
    await recordDeliveryFailure(payment, error);
  }
}

/**
 * Mirrors the payment email into the in-app bell.
 *
 * `notify` never throws and never re-sends mail (no `email` is supplied), so this
 * cannot duplicate the message the transport just sent or fail the capture.
 */
async function recordPaymentNotification(
  payment: IPayment,
  kind: 'payment_received' | 'payment_failed',
  detail?: string,
): Promise<void> {
  try {
    const context = await loadBookingContext(String(payment.booking_id));
    if (!context?.guestId) return;

    await notify(
      paymentNotice({
        userId: context.guestId,
        type:
          kind === 'payment_received'
            ? NotificationType.PAYMENT_RECEIVED
            : NotificationType.PAYMENT_FAILED,
        context,
        payment: {
          amount_minor: payment.amount_minor ?? 0,
          currency: payment.currency,
          invoice_number: payment.invoice_number,
        },
        detail,
      }),
    );
  } catch {
    // Side effect only; the payment is already committed.
  }
}

/** The gateway's reason for a failed attempt, when it gave one. */
function failureDetail(payment: IPayment): string | undefined {
  const failed = [...(payment.transactions ?? [])]
    .reverse()
    .find((entry) => entry.status === PaymentStatus.FAILED && entry.failure_reason);
  return failed?.failure_reason;
}

/** Refunds may only come from an admin or the provider who owns the booking. */
export async function assertCanRefund(caller: Caller, payment: IPayment): Promise<void> {
  if (isAdmin(caller)) return;

  const booking = await Booking.findById(payment.booking_id);
  if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  const owns = await canManageBooking(caller, booking);
  if (!owns) {
    throw new ApiError('Only an admin or the booking provider can issue refunds', 403, 'FORBIDDEN');
  }
}

/**
 * Refund history is readable by the guest who paid as well as by the provider
 * and an admin. Reading the trail is not the same as issuing a refund, so the
 * guest is deliberately allowed past this check.
 */
export async function canReadRefunds(caller: Caller, payment: IPayment): Promise<boolean> {
  if (isAdmin(caller)) return true;

  const booking = await Booking.findById(payment.booking_id);
  if (!booking) return false;

  if (String(booking.user_id) === caller.userId) return true;

  return canManageBooking(caller, booking);
}

/**
 * Starts a refund against captured money.
 *
 * The refundable ceiling is enforced here, not at the gateway: partial refunds
 * accumulate in `refunded_minor`, and the sum of every refund can never exceed
 * the amount that was actually captured.
 */
export async function initiateRefund(
  payment: IPayment,
  input: { amountMinor?: number; reason: string; actorId: string },
): Promise<{ refundReference: string; amountMinor: number; status: RefundStatus }> {
  // A fully refunded payment has no refundable balance left, so saying so is
  // more useful than the generic "only captured money" message.
  if (payment.payment_status === PaymentStatus.REFUNDED) {
    throw new ApiError('This payment has already been fully refunded', 409, 'ALREADY_REFUNDED');
  }

  if (![PaymentStatus.SUCCESSFUL, PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED].includes(
    payment.payment_status,
  )) {
    throw new ApiError(
      'Only captured money can be refunded',
      409,
      'PAYMENT_NOT_REFUNDABLE',
    );
  }

  const captured = payment.amount_minor;
  const alreadyRefunded = payment.refunded_minor ?? 0;
  const refundable = subMinor(captured, alreadyRefunded);

  if (refundable <= 0) {
    throw new ApiError('This payment has already been fully refunded', 409, 'ALREADY_REFUNDED');
  }

  const amountMinor = input.amountMinor ?? refundable;

  if (amountMinor <= 0) {
    throw new ApiError('Refund amount must be greater than zero', 400, 'INVALID_REFUND_AMOUNT');
  }

  if (compareMinor(amountMinor, refundable) > 0) {
    throw new ApiError(
      `A refund cannot exceed the ${formatMinorGrouped(refundable, payment.currency)} still refundable`,
      400,
      'REFUND_EXCEEDS_CAPTURED',
    );
  }

  const bankTranId = payment.transactions
    ?.slice()
    .reverse()
    .find((entry) => entry.bank_tran_id && entry.status === PaymentStatus.SUCCESSFUL)?.bank_tran_id;

  if (!bankTranId) {
    throw new ApiError(
      'The original transaction has no gateway reference to refund against',
      409,
      'NO_GATEWAY_TRANSACTION',
    );
  }

  const reference = refundReference();
  const provider = getProvider(payment.gateway);

  const result = await provider.refund({
    bankTranId,
    refundReference: reference,
    amountMinor,
    currency: payment.currency,
    reason: input.reason,
  });

  const status =
    result.status === 'refunded'
      ? RefundStatus.SUCCEEDED
      : result.status === 'failed'
        ? RefundStatus.FAILED
        : RefundStatus.PROCESSING;

  payment.refunds.push({
    refund_reference: reference,
    amount_minor: amountMinor,
    currency: payment.currency,
    reason: input.reason,
    status,
    gateway_refund_ref_id: result.gatewayRefundRefId,
    gateway_bank_tran_id: bankTranId,
    requested_by: input.actorId,
    requested_at: new Date(),
    settled_at: status === RefundStatus.SUCCEEDED ? new Date() : undefined,
    failure_reason: result.failureReason,
    payload: result.raw,
  } as never);

  payment.events.push({
    type: 'refund_requested',
    to_status: payment.payment_status,
    source: 'system',
    actor_id: input.actorId,
    message: `Refund of ${formatMinorGrouped(amountMinor, payment.currency)} requested`,
    metadata: { refund_reference: reference, amount_minor: amountMinor, status },
  } as never);

  // The money is already back, so the refunded total has to move before the
  // parent payment can legally be marked fully refunded.
  if (status === RefundStatus.SUCCEEDED) {
    payment.refunded_minor = addMinor(payment.refunded_minor ?? 0, amountMinor);
  }

  if (status === RefundStatus.SUCCEEDED) {
    await settleRefund(payment, reference, RefundStatus.SUCCEEDED);
  } else {
    await payment.save();
  }

  return { refundReference: reference, amountMinor, status };
}

/**
 * Polls the gateway for a refund that was accepted but not settled immediately,
 * and moves the parent payment to `PARTIALLY_REFUNDED` or `REFUNDED` once the
 * money is confirmed back.
 */
export async function refreshRefund(
  payment: IPayment,
  reference: string,
): Promise<{ status: RefundStatus; amountMinor: number }> {
  const refund = payment.refunds.find((entry) => entry.refund_reference === reference);
  if (!refund) throw new ApiError('Refund not found', 404, 'REFUND_NOT_FOUND');

  if (!refund.gateway_refund_ref_id) {
    throw new ApiError(
      'The gateway never accepted this refund, so there is nothing to poll',
      409,
      'REFUND_NOT_SUBMITTED',
    );
  }

  const provider = getProvider(payment.gateway);
  const result = await provider.queryRefund(refund.gateway_refund_ref_id);

  const status =
    result.status === 'refunded'
      ? RefundStatus.SUCCEEDED
      : result.status === 'failed'
        ? RefundStatus.FAILED
        : result.status === 'cancelled'
          ? RefundStatus.CANCELLED
          : RefundStatus.PROCESSING;

  refund.payload = result.raw;
  if (result.failureReason) refund.failure_reason = result.failureReason;

  if (status === RefundStatus.SUCCEEDED) {
    await settleRefund(payment, reference, status);
  } else {
    if (refund.status !== status) {
      assertRefundTransition(refund.status, status);
      refund.status = status;
    }
    await payment.save();
  }

  return { status, amountMinor: refund.amount_minor };
}

/** Marks a refund settled and recomputes the parent payment's refunded total. */
async function settleRefund(payment: IPayment, reference: string, status: RefundStatus): Promise<void> {
  const refund = payment.refunds.find((entry) => entry.refund_reference === reference);
  if (!refund) throw new ApiError('Refund not found', 404, 'REFUND_NOT_FOUND');

  if (refund.status !== status) {
    assertRefundTransition(refund.status, status);
    refund.status = status;
  }
  refund.settled_at = refund.settled_at ?? new Date();

  // Recomputed rather than incremented so a replayed confirmation cannot double
  // count a refund.
  const settled = payment.refunds
    .filter((entry) => entry.status === RefundStatus.SUCCEEDED)
    .reduce((total, entry) => addMinor(total, entry.amount_minor), 0);

  payment.refunded_minor = settled;

  const fullyRefunded = compareMinor(settled, payment.amount_minor) >= 0;
  const next = fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

  if (payment.payment_status !== next) {
    assertTransition(payment.payment_status, next);
    payment.payment_status = next;
  }
  payment.refund_status = next;

  payment.events.push({
    type: fullyRefunded ? 'refund_completed' : 'refund_partially_completed',
    to_status: next,
    source: 'gateway',
    message: `Refund ${reference} settled`,
    metadata: { refund_reference: reference, refunded_minor: settled },
  } as never);

  await payment.save();
  await dispatchRefundNotice(payment, refund.amount_minor, fullyRefunded);
}

/** Tells the guest their money is on its way back. Best effort, never throws. */
async function dispatchRefundNotice(
  payment: IPayment,
  amountMinor: number,
  fully: boolean,
): Promise<void> {
  try {
    const detail = fully
      ? `Your booking has been fully refunded: ${formatMinorGrouped(amountMinor, payment.currency)} ${payment.currency}.`
      : `A refund of ${formatMinorGrouped(amountMinor, payment.currency)} ${payment.currency} has been issued to your original payment method.`;

    await recordDelivery(payment, await sendPaymentNotice(payment, 'refund_update', detail));

    const context = await loadBookingContext(String(payment.booking_id));
    if (context?.guestId) {
      await notify(
        paymentNotice({
          userId: context.guestId,
          type: NotificationType.REFUND_UPDATE,
          context,
          payment: {
            amount_minor: payment.amount_minor ?? 0,
            currency: payment.currency,
            invoice_number: payment.invoice_number,
          },
          detail,
          refundMinor: amountMinor,
        }),
      );
    }
  } catch (error) {
    await recordDeliveryFailure(payment, error);
  }
}

/** Writes the outcome of a delivery attempt onto the payment. */
async function recordDelivery(
  payment: IPayment,
  delivery: { status: string; to?: string; reason?: string },
): Promise<void> {
  if (delivery.status === 'failed') {
    await recordDeliveryFailure(payment, new Error(delivery.reason ?? 'notification failed'));
    return;
  }

  payment.events.push({
    type: delivery.status === 'sent' ? 'notification_sent' : 'notification_skipped',
    source: 'system',
    message:
      delivery.status === 'sent'
        ? `Emailed ${delivery.to}`
        : `Not emailed: ${delivery.reason ?? delivery.status}`,
    metadata: { to: delivery.to, invoice_number: payment.invoice_number },
  } as never);
  await payment.save();
}

/** Notes that a notification could not even be attempted. */
async function recordDeliveryFailure(payment: IPayment, error: unknown): Promise<void> {
  payment.events.push({
    type: 'notification_failed',
    source: 'system',
    message: error instanceof Error ? error.message.slice(0, 200) : 'notification failed',
  } as never);
  await payment.save().catch(() => undefined);
}

/** The decimal amount a refund corresponds to, for API responses. */
export function refundAmountDecimal(amountMinor: number, currency: string): number {
  return fromMinor(amountMinor, currency);
}
