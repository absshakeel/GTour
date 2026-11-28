import mongoose, { Schema, Document } from 'mongoose';
import { GatewayProvider, PaymentStatus, RefundStatus } from '@gtour/shared-types';
import { currencyCode } from '../config/currency';
import { toMinor } from '../utils/money';

/** One hosted-checkout attempt against a booking. */
export interface IPaymentTransaction extends mongoose.Types.Subdocument {
  tran_id: string;
  sessionkey?: string;
  gateway_page_url?: string;
  provider: GatewayProvider;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  val_id?: string;
  bank_tran_id?: string;
  store_amount_minor?: number;
  currency_type?: string;
  currency_amount_minor?: number;
  currency_rate?: number;
  card_brand?: string;
  card_type?: string;
  card_issuer?: string;
  card_issuer_country?: string;
  /** Card number as returned by the gateway, already masked by them. */
  card_mask?: string;
  risk_level?: string;
  risk_title?: string;
  failure_reason?: string;
  initiated_at: Date;
  validated_at?: Date;
  completed_at?: Date;
  /** Raw gateway payload, kept for dispute audit. */
  payload?: Record<string, unknown>;
}

export interface IPaymentRefund extends mongoose.Types.Subdocument {
  refund_reference: string;
  amount_minor: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  gateway_refund_ref_id?: string;
  gateway_bank_tran_id?: string;
  requested_by?: mongoose.Types.ObjectId;
  failure_reason?: string;
  requested_at: Date;
  settled_at?: Date;
  payload?: Record<string, unknown>;
}

export interface IPaymentEvent extends mongoose.Types.Subdocument {
  type: string;
  from_status?: string;
  to_status?: string;
  source: 'gateway' | 'admin' | 'provider' | 'system';
  actor_id?: mongoose.Types.ObjectId;
  message?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export interface IPayment extends Document {
  booking_id: mongoose.Types.ObjectId;
  amount: number;
  /** `amount` in integer minor units — the authoritative figure for arithmetic. */
  amount_minor: number;
  currency: string;
  payment_method: string;
  transaction_reference?: string;
  payment_status: PaymentStatus;
  payment_date?: Date;
  refund_status?: PaymentStatus;
  /** Sum of every refund that settled, in minor units. */
  refunded_minor: number;
  gateway: GatewayProvider;
  /** Tourist who started the hosted checkout; used for surfacing a resume link. */
  initiated_by?: mongoose.Types.ObjectId;
  invoice_number?: string;
  invoice_generated_at?: Date;
  transactions: mongoose.Types.DocumentArray<IPaymentTransaction>;
  refunds: mongoose.Types.DocumentArray<IPaymentRefund>;
  events: mongoose.Types.DocumentArray<IPaymentEvent>;
  /** Written by `timestamps: true` on the schema below. */
  createdAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    tran_id: { type: String, required: true },
    sessionkey: { type: String },
    gateway_page_url: { type: String },
    provider: {
      type: String,
      enum: Object.values(GatewayProvider),
      default: GatewayProvider.SSLCOMMERZ,
    },
    amount_minor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, length: 3 },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    val_id: { type: String },
    bank_tran_id: { type: String },
    store_amount_minor: { type: Number },
    currency_type: { type: String },
    currency_amount_minor: { type: Number },
    currency_rate: { type: Number },
    card_brand: { type: String },
    card_type: { type: String },
    card_issuer: { type: String },
    card_issuer_country: { type: String },
    card_mask: { type: String },
    risk_level: { type: String },
    risk_title: { type: String },
    failure_reason: { type: String },
    initiated_at: { type: Date, default: () => new Date() },
    validated_at: { type: Date },
    completed_at: { type: Date },
    payload: { type: Schema.Types.Mixed },
  },
  { _id: true },
);

const PaymentRefundSchema = new Schema<IPaymentRefund>(
  {
    refund_reference: { type: String, required: true },
    amount_minor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, length: 3 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.PENDING,
    },
    gateway_refund_ref_id: { type: String },
    gateway_bank_tran_id: { type: String },
    requested_by: { type: Schema.Types.ObjectId, ref: 'User' },
    failure_reason: { type: String },
    requested_at: { type: Date, default: () => new Date() },
    settled_at: { type: Date },
    payload: { type: Schema.Types.Mixed },
  },
  { _id: true },
);

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    type: { type: String, required: true },
    from_status: { type: String },
    to_status: { type: String },
    source: {
      type: String,
      enum: ['gateway', 'admin', 'provider', 'system'],
      required: true,
    },
    actor_id: { type: Schema.Types.ObjectId, ref: 'User' },
    message: { type: String },
    metadata: { type: Schema.Types.Mixed },
    created_at: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const PaymentSchema = new Schema<IPayment>(
  {
    booking_id: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    amount_minor: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: () => currencyCode(),
      length: 3,
    },
    payment_method: {
      type: String,
      required: true,
    },
    transaction_reference: {
      type: String,
    },
    payment_status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    payment_date: {
      type: Date,
    },
    refund_status: {
      type: String,
      enum: Object.values(PaymentStatus),
    },
    refunded_minor: {
      type: Number,
      default: 0,
      min: 0,
    },
    gateway: {
      type: String,
      enum: Object.values(GatewayProvider),
      default: GatewayProvider.MANUAL,
    },
    initiated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    invoice_number: {
      type: String,
    },
    invoice_generated_at: {
      type: Date,
    },
    transactions: { type: [PaymentTransactionSchema], default: [] },
    refunds: { type: [PaymentRefundSchema], default: [] },
    events: { type: [PaymentEventSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

/**
 * `amount_minor` is the authoritative figure for all money arithmetic, so it is
 * derived rather than trusted: any write that supplies `amount` but omits or
 * mismatches the minor value is corrected before validation runs. This keeps the
 * two fields consistent no matter which caller creates the row.
 */
PaymentSchema.pre('validate', function syncAmountMinor(next) {
  const doc = this as unknown as IPayment;
  if (typeof doc.amount === 'number' && Number.isFinite(doc.amount)) {
    doc.amount_minor = toMinor(doc.amount, doc.currency || currencyCode());
  }
  next();
});

// One settled payment row per booking. Retries live in `transactions`, so this
// holds no matter how many gateway attempts a booking accumulates.
PaymentSchema.index({ booking_id: 1 }, { unique: true });
PaymentSchema.index({ payment_status: 1 });
// Sparse so the many payments without an invoice are not forced to collide.
PaymentSchema.index({ invoice_number: 1 }, { unique: true, sparse: true });
// IPN and callback handlers resolve the payment from the gateway's `tran_id` echo.
PaymentSchema.index({ 'transactions.tran_id': 1 });
PaymentSchema.index({ 'transactions.val_id': 1 }, { sparse: true });
PaymentSchema.index({ 'transactions.bank_tran_id': 1 }, { sparse: true });
PaymentSchema.index({ 'refunds.refund_reference': 1 }, { sparse: true });
PaymentSchema.index({ 'refunds.gateway_refund_ref_id': 1 }, { sparse: true });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
