import { GatewayProvider } from '@gtour/shared-types';

/** A payment method the active provider is actually able to accept. */
export interface ProviderChannel {
  name: string;
  type: string;
  logoUrl?: string;
}

export interface CreateCheckoutInput {
  /** Merchant-side unique transaction id (SSLCommerz caps this at 30 chars). */
  tranId: string;
  /** Amount in integer minor units; providers wanting decimals format it. */
  amountMinor: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  customerPhone?: string;
  productName: string;
  productCategory: string;
  /** Absolute URLs the gateway redirects the customer back to. */
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  /** Free-form values echoed back on return and validation, max 255 chars each. */
  metadata?: Record<string, string>;
  /**
   * The `travel-vertical` product profile validates these fields on the
   * gateway's side, so every one of them must be present or the session is
   * refused outright. `nights` is a night count; it is rendered as
   * "N days" the way the gateway documents it.
   */
  travel?: TravelDetails;
}

export interface TravelDetails {
  /** Hotel the stay belongs to, shown in the gateway's order detail. */
  hotelName: string;
  /** Night count; rendered as "N days" the way the gateway documents it. */
  nights: number;
  rooms: number;
  /** Destination city, e.g. "Cox's Bazar". */
  city: string;
}

export interface CreateCheckoutResult {
  sessionKey: string;
  /** Where to send the customer's browser. */
  gatewayPageUrl: string;
  /** Channels the gateway reports as enabled for this store. */
  channels: ProviderChannel[];
  raw: Record<string, unknown>;
}

/** Normalised, gateway-verified transaction facts. */
export interface ValidatedPayment {
  valId: string;
  tranId: string;
  /** `valid` and `alreadyValidated` mean money moved. */
  status: 'valid' | 'already_validated' | 'invalid' | 'pending' | 'unknown';
  amountMinor?: number;
  storeAmountMinor?: number;
  currency?: string;
  /** Currency the customer was actually charged in, when the gateway converted. */
  currencyType?: string;
  currencyAmountMinor?: number;
  currencyRate?: number;
  bankTranId?: string;
  cardBrand?: string;
  cardType?: string;
  cardIssuer?: string;
  cardIssuerCountry?: string;
  cardMask?: string;
  riskLevel?: string;
  riskTitle?: string;
  failureReason?: string;
  transactionDate?: string;
  metadata?: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  /** Gateway-side transaction id of the original payment. */
  bankTranId: string;
  /** Our own unique reference for this refund. */
  refundReference: string;
  amountMinor: number;
  currency: string;
  reason: string;
}

export interface RefundResult {
  status: 'processing' | 'refunded' | 'failed' | 'cancelled';
  /** Gateway reference used later to poll the refund. */
  gatewayRefundRefId?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

/**
 * The payment rails the app can settle through. Only signature and amount facts
 * the provider itself can establish belong here; anything needing our database
 * (booking ownership, duplicate capture) lives in the service layer.
 */
export interface PaymentProvider {
  readonly name: GatewayProvider;

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  /**
   * Asks the gateway to confirm a `val_id`. Callers must never trust a callback
   * body alone: the gateway is the only authority on whether money moved.
   */
  validate(valId: string): Promise<ValidatedPayment>;

  refund(input: RefundInput): Promise<RefundResult>;

  queryRefund(refundRefId: string): Promise<RefundResult>;
}
