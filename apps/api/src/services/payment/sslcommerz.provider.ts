import { GatewayProvider } from '@gtour/shared-types';
import { getSslcommerz, isSslcommerzEnabled } from '../../config/sslcommerz';
import { currencyCode } from '../../config/currency';
import { formatMinor, toMinor } from '../../utils/money';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  ProviderChannel,
  RefundInput,
  RefundResult,
  ValidatedPayment,
} from './provider';

/** Gateway calls must not hang a request thread when SSLCommerz is slow. */
const REQUEST_TIMEOUT_MS = 20_000;

/** SSLCommerz rejects `tran_id` and `value_*` longer than this. */
const MAX_ECHO_LENGTH = 255;
const MAX_TRAN_ID_LENGTH = 30;

type Payload = Record<string, unknown>;

/**
 * Converts a gateway decimal string (`"103.00"`) into minor units. Returns
 * `undefined` for anything non-numeric so a malformed field disables that one
 * comparison instead of corrupting the amount check.
 */
function minorFromGateway(value: unknown, currency: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return toMinor(parsed, currency);
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/** `desc[]` is the gateway's own list of the channels this store can accept. */
function readChannels(payload: Payload): ProviderChannel[] {
  const desc = payload.desc;
  if (!Array.isArray(desc)) return [];

  return desc
    .filter((entry): entry is Payload => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      name: asString(entry.name) ?? '',
      type: asString(entry.type) ?? '',
      logoUrl: asString(entry.logo),
    }))
    .filter((channel) => channel.name !== '');
}

async function requestJson(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Payload> {
  let response: Response;

  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new ApiError(
      `Payment gateway is unreachable during ${operation}`,
      502,
      'GATEWAY_UNREACHABLE',
      { cause: (error as Error).message },
    );
  }

  const body = await response.text();

  if (!response.ok) {
    throw new ApiError(`Payment gateway rejected the ${operation} request`, 502, 'GATEWAY_ERROR', {
      httpStatus: response.status,
      body: body.slice(0, 500),
    });
  }

  try {
    return JSON.parse(body) as Payload;
  } catch {
    throw new ApiError(
      `Payment gateway returned an unreadable ${operation} response`,
      502,
      'GATEWAY_BAD_RESPONSE',
      { body: body.slice(0, 500) },
    );
  }
}

/**
 * SSLCommerz hosted-checkout provider.
 *
 * All credentials stay server-side; the browser only ever receives the
 * `GatewayPageURL` to redirect to.
 */
export class SslcommerzProvider implements PaymentProvider {
  readonly name = GatewayProvider.SSLCOMMERZ;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (!isSslcommerzEnabled()) {
      throw new ApiError(
        'Online payment is not available right now',
        503,
        'GATEWAY_NOT_CONFIGURED',
      );
    }

    if (input.tranId.length > MAX_TRAN_ID_LENGTH) {
      throw new ApiError('Transaction id is too long', 500, 'INVALID_TRAN_ID');
    }

    const config = getSslcommerz();
    const currency = input.currency || currencyCode();
    const travel = input.travel;
    const nights = Math.max(1, travel?.nights ?? 1);

    const form = new URLSearchParams({
      store_id: config.storeId,
      store_passwd: config.storePassword,
      total_amount: formatMinor(input.amountMinor, currency),
      currency,
      tran_id: input.tranId,
      product_category: input.productCategory,
      product_name: input.productName,
      product_profile: 'travel-vertical',
      shipping_method: 'NO',
      num_of_item: '1',
      cus_name: input.customerName,
      cus_email: input.customerEmail,
      cus_add1: input.customerAddress || 'N/A',
      cus_city: 'N/A',
      cus_country: 'Bangladesh',
      cus_phone: input.customerPhone || 'N/A',
      success_url: input.successUrl,
      fail_url: input.failUrl,
      cancel_url: input.cancelUrl,
      ipn_url: input.ipnUrl,
      // The `travel-vertical` profile is validated server-side by the gateway:
      // omit any of these four and the session is refused with
      // "Invalid Information!". They are therefore always sent together.
      hotel_name: travel?.hotelName || input.productName,
      length_of_stay: `${nights} ${nights === 1 ? 'day' : 'days'}`,
      // The gateway asks for the room's checking-in window, not an arrival
      // time. Ours are whole-day bookings, so every room is held for 24 hrs.
      check_in_time: '24 hrs',
      hotel_city: travel?.city || 'N/A',
    });

    if (travel) form.set('num_of_room', String(travel.rooms));

    // `value_a`–`value_d` are echoed back on both the redirect and the IPN, so
    // they carry our identifiers rather than trusting the browser to return them.
    for (const [key, value] of Object.entries(input.metadata || {})) {
      form.set(key, value.slice(0, MAX_ECHO_LENGTH));
    }

    const payload = await requestJson(
      `${config.baseUrl}/gwprocess/v4/api.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
      'checkout',
    );

    if (asString(payload.status) !== 'SUCCESS') {
      throw new ApiError(
        asString(payload.failedreason) || 'Payment gateway could not start a checkout session',
        502,
        'CHECKOUT_FAILED',
      );
    }

    const gatewayPageUrl = asString(payload.GatewayPageURL);
    const sessionKey = asString(payload.sessionkey);

    if (!gatewayPageUrl || !sessionKey) {
      throw new ApiError(
        'Payment gateway returned an incomplete checkout session',
        502,
        'GATEWAY_BAD_RESPONSE',
      );
    }

    return {
      sessionKey,
      gatewayPageUrl,
      channels: readChannels(payload),
      raw: payload,
    };
  }

  async validate(valId: string): Promise<ValidatedPayment> {
    if (!isSslcommerzEnabled()) {
      throw new ApiError(
        'Online payment is not available right now',
        503,
        'GATEWAY_NOT_CONFIGURED',
      );
    }

    const config = getSslcommerz();
    const query = new URLSearchParams({
      val_id: valId,
      store_id: config.storeId,
      store_passwd: config.storePassword,
      format: 'json',
      v: '1',
    });

    const payload = await requestJson(
      `${config.validatorUrl}/validator/api/validationserverAPI.php?${query}`,
      { method: 'GET' },
      'validation',
    );

    const gatewayStatus = asString(payload.status);
    const currency = asString(payload.currency) || currencyCode();
    const currencyType = asString(payload.currency_type);

    return {
      valId,
      tranId: asString(payload.tran_id) || '',
      status: mapValidationStatus(gatewayStatus),
      amountMinor: minorFromGateway(payload.amount, currency),
      storeAmountMinor: minorFromGateway(payload.store_amount, currency),
      currency,
      currencyType,
      // `currency_amount` is denominated in `currency_type`, not `currency`.
      currencyAmountMinor: minorFromGateway(
        payload.currency_amount,
        currencyType || currency,
      ),
      currencyRate: Number.isFinite(Number(payload.currency_rate))
        ? Number(payload.currency_rate)
        : undefined,
      bankTranId: asString(payload.bank_tran_id),
      cardBrand: asString(payload.card_brand),
      cardType: asString(payload.card_type),
      cardIssuer: asString(payload.card_issuer),
      cardIssuerCountry: asString(payload.card_issuer_country),
      cardMask: asString(payload.card_no),
      riskLevel: asString(payload.risk_level),
      riskTitle: asString(payload.risk_title),
      failureReason: gatewayStatus === 'VALID' ? undefined : gatewayStatus,
      transactionDate: asString(payload.tran_date),
      metadata: {
        value_a: asString(payload.value_a) || '',
        value_b: asString(payload.value_b) || '',
        value_c: asString(payload.value_c) || '',
        value_d: asString(payload.value_d) || '',
      },
      raw: payload,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!isSslcommerzEnabled()) {
      throw new ApiError(
        'Online payment is not available right now',
        503,
        'GATEWAY_NOT_CONFIGURED',
      );
    }

    const config = getSslcommerz();
    const query = new URLSearchParams({
      bank_tran_id: input.bankTranId,
      refund_trans_id: input.refundReference,
      refund_amount: formatMinor(input.amountMinor, input.currency),
      refund_remarks: input.reason.slice(0, MAX_ECHO_LENGTH),
      store_id: config.storeId,
      store_passwd: config.storePassword,
      format: 'json',
      v: '1',
    });

    const payload = await requestJson(
      `${config.validatorUrl}/validator/api/merchantTransIDvalidationAPI.php?${query}`,
      { method: 'GET' },
      'refund',
    );

    return readRefundResult(payload);
  }

  async queryRefund(refundRefId: string): Promise<RefundResult> {
    if (!isSslcommerzEnabled()) {
      throw new ApiError(
        'Online payment is not available right now',
        503,
        'GATEWAY_NOT_CONFIGURED',
      );
    }

    const config = getSslcommerz();
    const query = new URLSearchParams({
      refund_ref_id: refundRefId,
      store_id: config.storeId,
      store_passwd: config.storePassword,
      format: 'json',
      v: '1',
    });

    const payload = await requestJson(
      `${config.validatorUrl}/validator/api/merchantTransIDvalidationAPI.php?${query}`,
      { method: 'GET' },
      'refund status',
    );

    return readRefundResult(payload);
  }
}

/**
 * `VALID` is a first confirmation. `VALIDATED` means our side already confirmed
 * this transaction — money still moved, so it must never be treated as a
 * failure; the caller uses it to detect a duplicate notification.
 */
function mapValidationStatus(status: string | undefined): ValidatedPayment['status'] {
  switch (status) {
    case 'VALID':
      return 'valid';
    case 'VALIDATED':
      return 'already_validated';
    case 'INVALID_TRANSACTION':
      return 'invalid';
    case 'PENDING':
      return 'pending';
    default:
      return 'unknown';
  }
}

function readRefundResult(payload: Payload): RefundResult {
  const apiConnect = asString(payload.APIConnect);
  const status = (asString(payload.status) || '').toLowerCase();

  // `APIConnect` reports transport/auth state; `status` reports the refund itself.
  if (apiConnect && apiConnect !== 'DONE') {
    return {
      status: 'failed',
      gatewayRefundRefId: asString(payload.refund_ref_id),
      failureReason: asString(payload.errorReason) || apiConnect,
      raw: payload,
    };
  }

  switch (status) {
    case 'success':
      return { status: 'processing', gatewayRefundRefId: asString(payload.refund_ref_id), raw: payload };
    case 'refunded':
      return { status: 'refunded', gatewayRefundRefId: asString(payload.refund_ref_id), raw: payload };
    case 'processing':
      return { status: 'processing', gatewayRefundRefId: asString(payload.refund_ref_id), raw: payload };
    case 'cancelled':
      return { status: 'cancelled', gatewayRefundRefId: asString(payload.refund_ref_id), raw: payload };
    default:
      return {
        status: 'failed',
        gatewayRefundRefId: asString(payload.refund_ref_id),
        failureReason: asString(payload.errorReason) || 'Refund was rejected by the gateway',
        raw: payload,
      };
  }
}

/** The single SSLCommerz instance used by the registry. */
export const sslcommerzProvider = new SslcommerzProvider();
