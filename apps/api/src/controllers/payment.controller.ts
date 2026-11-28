import { Response, NextFunction } from 'express';
import Booking from '../models/Booking';
import Payment from '../models/Payment';
import type { IPayment } from '../models/Payment';
import { createPaymentSchema, paymentLedgerSchema, updatePaymentSchema } from '@gtour/validation';
import { GatewayProvider, PaymentStatus, isCapturedPayment } from '@gtour/shared-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId, isDuplicateKeyError, parseOrThrow } from '../utils/http';
import { canManageBooking, isAdmin, ownedResources } from '../services/bookingAccess.service';
import {
  buildInvoiceData,
  canIssueInvoice,
  ensureInvoice,
  invoiceExists,
  invoicePathFor,
} from '../services/payment/invoice.service';
import { currencyCode } from '../config/currency';
import { toMinor } from '../utils/money';

/**
 * A payment row is readable by the guest who booked, the provider that owns the
 * booked resource, and admins.
 */
async function loadReadableBooking(req: AuthRequest) {
  if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

  const bookingId = assertObjectId(req.params.bookingId, 'booking id');
  const booking = await Booking.findById(bookingId);

  if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  const isGuest = String(booking.user_id) === req.user.userId;
  const isProvider = await canManageBooking(req.user, booking);

  if (!isGuest && !isProvider) {
    throw new ApiError('Not authorized to access this payment', 403, 'FORBIDDEN');
  }

  return booking;
}

export const getPaymentByBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const booking = await loadReadableBooking(req);
    const payment = await Payment.findOne({ booking_id: booking._id });

    if (!payment) {
      throw new ApiError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    res.json({ success: true, payment });
  } catch (error) {
    next(error);
  }
};

/**
 * Records a payment against a booking the caller made.
 *
 * `amount` and `currency` are copied from the booking's stored price snapshot,
 * never from the request body, so a guest cannot under-declare a payment.
 */
export const createPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const data = parseOrThrow(createPaymentSchema, req.body);
    const bookingId = assertObjectId(data.booking_id, 'booking id');
    const booking = await Booking.findById(bookingId);

    if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    const isGuest = String(booking.user_id) === req.user.userId;
    if (!isGuest && !isAdmin(req.user)) {
      throw new ApiError('You can only pay for your own booking', 403, 'FORBIDDEN');
    }

    const existing = await Payment.findOne({ booking_id: booking._id });
    if (existing) {
      throw new ApiError('A payment already exists for this booking', 409, 'PAYMENT_EXISTS');
    }

    const currency = booking.price_snapshot?.currency || currencyCode();
    const detail = {
      booking_id: booking._id,
      amount: booking.total_amount,
      amount_minor: toMinor(booking.total_amount, currency),
      currency,
      payment_method: data.payment_method,
      transaction_reference: data.transaction_reference,
      payment_status: PaymentStatus.PENDING,
      gateway: GatewayProvider.MANUAL,
      events: [
        {
          type: 'created',
          to_status: PaymentStatus.PENDING,
          source: 'system' as const,
          actor_id: req.user.userId,
          message: `Offline payment recorded via ${data.payment_method}`,
        },
      ],
    };

    // The filter repeats the uniqueness rule so two concurrent first payments
    // for one booking cannot both insert; whichever loses gets the 409 below.
    const payment = await Payment.findOneAndUpdate(
      { booking_id: booking._id },
      { $setOnInsert: detail },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).catch((error: unknown) => {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    });

    if (!payment) {
      throw new ApiError('A payment already exists for this booking', 409, 'PAYMENT_EXISTS');
    }

    res.status(201).json({ success: true, payment });
  } catch (error) {
    next(error);
  }
};

/**
 * Only a trusted workflow may confirm money received: admins directly, and the
 * provider that owns the booked resource. Guests cannot mark their own payment
 * as completed.
 */
export const updatePayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const data = parseOrThrow(updatePaymentSchema, req.body);
    const bookingId = assertObjectId(req.params.bookingId, 'booking id');
    const booking = await Booking.findById(bookingId);

    if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    const currency = booking.price_snapshot?.currency || currencyCode();

    const isProvider = await canManageBooking(req.user, booking);
    if (!isProvider) {
      throw new ApiError('Only the provider or an admin can update a payment', 403, 'FORBIDDEN');
    }

    if (isCapturedPayment(data.payment_status)) {
      if (booking.status !== 'confirmed' && booking.status !== 'completed') {
        throw new ApiError(
          'A payment can only be completed for a confirmed booking',
          409,
          'BOOKING_NOT_CONFIRMED',
        );
      }
    }

    const payment = await Payment.findOneAndUpdate(
      { booking_id: booking._id },
      {
        ...data,
        ...(isCapturedPayment(data.payment_status) && { payment_date: new Date() }),
        // Rows created before minor units existed get backfilled on the first
        // manual update, so reconciliation keeps one authoritative figure.
        amount_minor: toMinor(booking.total_amount, currency),
      },
      { new: true, runValidators: true },
    );

    if (!payment) {
      throw new ApiError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    res.json({ success: true, payment });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin payment ledger. Only admins reach this endpoint: a provider's view of
 * payments is already reachable per-booking through `GET /bookings/provider`
 * plus `GET /payments/booking/:bookingId`, and a platform-wide money ledger must
 * not be readable by a provider.
 */
export const listPayments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = parseOrThrow(paymentLedgerSchema, req.query);

    const filters: Record<string, unknown> = {};

    if (parsed.payment_status) filters.payment_status = parsed.payment_status;

    if (parsed.date_from || parsed.date_to) {
      filters.createdAt = {
        ...(parsed.date_from ? { $gte: new Date(parsed.date_from) } : {}),
        ...(parsed.date_to ? { $lte: new Date(parsed.date_to) } : {}),
      };
    }

    if (parsed.search) {
      // A billing query quotes either the gateway reference or the invoice.
      filters.$or = [
        { transaction_reference: { $regex: parsed.search, $options: 'i' } },
        { invoice_number: { $regex: parsed.search, $options: 'i' } },
      ];
    }

    const total = await Payment.countDocuments(filters);
    const pages = Math.ceil(total / parsed.limit) || 0;

    const payments = await Payment.find(filters)
      .populate({
        path: 'booking_id',
        select: 'booking_reference booking_type status total_amount user_id start_date',
        populate: { path: 'user_id', select: 'name email' },
      })
      .sort({ createdAt: -1 })
      .skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit);

    // Totalled over the whole filter rather than the page, so the headline
    // figures stay honest when the ledger is paginated.
    const summary = await summarizePayments(filters);

    res.json({
      success: true,
      payments,
      summary,
      pagination: { page: parsed.page, limit: parsed.limit, total, pages },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ledger totals for the rows the caller can see.
 *
 * Computed in the database over the same filter as the page so a paginated view
 * still reports the whole picture.
 */
async function summarizePayments(scope: Record<string, unknown>) {
  const [row] = await Payment.aggregate<{
    captured_minor: number;
    refunded_minor: number;
    outstanding_minor: number;
    captured_count: number;
    refunded_count: number;
    failed_count: number;
    pending_count: number;
  }>([
    { $match: scope },
    {
      $group: {
        _id: null,
        captured_minor: {
          $sum: {
            $cond: [
              { $in: ['$payment_status', [PaymentStatus.SUCCESSFUL, PaymentStatus.COMPLETED]] },
              { $ifNull: ['$amount_minor', 0] },
              0,
            ],
          },
        },
        refunded_minor: { $sum: { $ifNull: ['$refunded_minor', 0] } },
        outstanding_minor: {
          $sum: {
            $cond: [
              {
                $in: [
                  '$payment_status',
                  [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED],
                ],
              },
              { $ifNull: ['$amount_minor', 0] },
              0,
            ],
          },
        },
        captured_count: {
          $sum: {
            $cond: [
              { $in: ['$payment_status', [PaymentStatus.SUCCESSFUL, PaymentStatus.COMPLETED]] },
              1,
              0,
            ],
          },
        },
        refunded_count: {
          $sum: {
            $cond: [
              {
                $in: [
                  '$payment_status',
                  [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
                ],
              },
              1,
              0,
            ],
          },
        },
        failed_count: {
          $sum: { $cond: [{ $eq: ['$payment_status', PaymentStatus.FAILED] }, 1, 0] },
        },
        pending_count: {
          $sum: {
            $cond: [
              { $in: ['$payment_status', [PaymentStatus.PENDING, PaymentStatus.PROCESSING]] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  if (!row) return emptySummary();

  return {
    captured_minor: row.captured_minor,
    refunded_minor: row.refunded_minor,
    outstanding_minor: row.outstanding_minor,
    captured_count: row.captured_count,
    refunded_count: row.refunded_count,
    failed_count: row.failed_count,
    pending_count: row.pending_count,
  };
}

function emptySummary() {
  return {
    captured_minor: 0,
    refunded_minor: 0,
    outstanding_minor: 0,
    captured_count: 0,
    refunded_count: 0,
    failed_count: 0,
    pending_count: 0,
  };
}

/** Loads a settlement the caller is allowed to see, by payment id. */
async function loadSettleablePayment(req: AuthRequest): Promise<IPayment> {
  if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

  const payment = await Payment.findById(assertObjectId(req.params.paymentId, 'payment id'));
  if (!payment) throw new ApiError('Payment not found', 404, 'PAYMENT_NOT_FOUND');

  const booking = await Booking.findById(payment.booking_id);
  if (!booking) throw new ApiError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  const isGuest = String(booking.user_id) === req.user.userId;
  const isProvider = await canManageBooking(req.user, booking);

  if (!isGuest && !isProvider && !isAdmin(req.user)) {
    throw new ApiError('Not authorized to access this invoice', 403, 'FORBIDDEN');
  }

  return payment;
}

/**
 * The line items behind an invoice, for the on-screen view.
 *
 * Rendered from the same builder the PDF uses so the two can never disagree.
 */
export const getInvoice = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const payment = await loadSettleablePayment(req);

    if (!canIssueInvoice(payment.payment_status)) {
      throw new ApiError(
        'An invoice is only available once payment is captured',
        409,
        'INVOICE_NOT_AVAILABLE',
      );
    }

    const number = await ensureInvoice(payment);
    const invoice = await buildInvoiceData(payment);

    res.json({
      success: true,
      invoice: { ...invoice, invoiceNumber: number, downloadAvailable: invoiceExists(number) },
    });
  } catch (error) {
    next(error);
  }
};

/** Streams the invoice PDF as a download. */
export const downloadInvoice = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const payment = await loadSettleablePayment(req);

    if (!canIssueInvoice(payment.payment_status)) {
      throw new ApiError(
        'An invoice is only available once payment is captured',
        409,
        'INVOICE_NOT_AVAILABLE',
      );
    }

    const number = await ensureInvoice(payment);
    const path = invoicePathFor(number);

    res.download(path, `${number}.pdf`, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Settlements for the resources the caller owns.
 *
 * `GET /payments` is admin-only, so a hotel owner has no way to reconcile what
 * their own properties have taken. The scope is derived from resource ownership
 * — never from a query parameter — and admins keep the global ledger.
 */
export const listProviderPayments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const parsed = parseOrThrow(paymentLedgerSchema, req.query);
    const scope: Record<string, unknown> = {};

    if (parsed.payment_status) scope.payment_status = parsed.payment_status;

    if (parsed.date_from || parsed.date_to) {
      scope.createdAt = {
        ...(parsed.date_from ? { $gte: new Date(parsed.date_from) } : {}),
        ...(parsed.date_to ? { $lte: new Date(parsed.date_to) } : {}),
      };
    }

    if (parsed.search) {
      scope.$or = [
        { transaction_reference: { $regex: parsed.search, $options: 'i' } },
        { invoice_number: { $regex: parsed.search, $options: 'i' } },
      ];
    }

    if (!isAdmin(req.user)) {
      const owned = await ownedResources(req.user);

      if (owned.hotelIds.length + owned.serviceIds.length + owned.vehicleIds.length === 0) {
        res.json({
          success: true,
          payments: [],
          summary: emptySummary(),
          pagination: { page: parsed.page, limit: parsed.limit, total: 0, pages: 0 },
        });
        return;
      }

      const bookingIds = await Booking.distinct('_id', {
        $or: [
          { hotel_id: { $in: owned.hotelIds } },
          { photography_service_id: { $in: owned.serviceIds } },
          { vehicle_id: { $in: owned.vehicleIds } },
        ],
      });

      scope.booking_id = { $in: bookingIds };
    }

    const [total, payments, summary] = await Promise.all([
      Payment.countDocuments(scope),
      Payment.find(scope)
        .populate({
          path: 'booking_id',
          select: 'booking_reference booking_type status total_amount user_id start_date hotel_id',
          populate: [
            { path: 'user_id', select: 'name email' },
            { path: 'hotel_id', select: 'name' },
          ],
        })
        .sort({ createdAt: -1 })
        .skip((parsed.page - 1) * parsed.limit)
        .limit(parsed.limit),
      summarizePayments(scope),
    ]);

    res.json({
      success: true,
      payments,
      summary,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        pages: Math.ceil(total / parsed.limit) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
