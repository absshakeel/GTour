import { Router } from 'express';
import {
  downloadInvoice,
  getInvoice,
  getPaymentByBooking,
  createPayment,
  listPayments,
  listProviderPayments,
  updatePayment,
} from '../controllers/payment.controller';
import {
  getCheckoutQuote,
  listRefunds,
  refreshRefundStatus,
  startCheckout,
  startRefund,
} from '../controllers/gateway.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Record an offline payment for a booking
 *     description: |
 *       Records money that changed hands outside the gateway — cash on arrival,
 *       a bank transfer or a mobile-wallet transfer. For a card or online
 *       payment use `POST /payments/checkout` instead, which opens a hosted
 *       SSLCommerz session and lets the gateway confirm the money moved.
 *
 *       `amount` and `currency` are copied from the booking's stored price
 *       snapshot, never from the request body, and the new payment always starts
 *       as `pending` until an operator confirms it. Only the guest who made the
 *       booking (or an admin) may record it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentInput'
 *     responses:
 *       201:
 *         description: Payment recorded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: The booking belongs to another guest.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: A payment already exists for this booking.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @openapi
 * /payments:
 *   get:
 *     tags: [Payments]
 *     summary: List every payment (admin only)
 *     description: |
 *       The platform-wide payment ledger, newest first, with each row's booking
 *       and guest populated. Restricted to admins — a provider reads payments
 *       per booking through `/payments/booking/{bookingId}` instead. Totals
 *       cover every matching row, not just the current page.
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: payment_status
 *         in: query
 *         schema:
 *           $ref: '#/components/schemas/PaymentStatus'
 *       - name: search
 *         in: query
 *         description: Case-insensitive match on the transaction reference or invoice number.
 *         schema: { type: string }
 *       - name: date_from
 *         in: query
 *         description: Earliest payment creation date (ISO 8601).
 *         schema: { type: string, format: date }
 *       - name: date_to
 *         in: query
 *         description: Latest payment creation date (ISO 8601).
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: One page of payments plus ledger totals.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 payments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 *                 summary:
 *                   $ref: '#/components/schemas/PaymentSummary'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authenticate, authorize(UserRole.ADMIN), listPayments);

/**
 * @openapi
 * /payments/provider:
 *   get:
 *     tags: [Payments]
 *     summary: List settlements for the caller's own resources
 *     description: |
 *       The reconciliation ledger for a hotel owner, photographer or vehicle
 *       provider. Scope comes from the resources the caller owns, so a provider
 *       can never widen it with a query parameter; admins receive the full
 *       ledger. Totals cover every matching row, not just the current page.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: payment_status
 *         schema: { $ref: '#/components/schemas/PaymentStatus' }
 *       - in: query
 *         name: search
 *         description: Matches the transaction reference or invoice number.
 *         schema: { type: string }
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: A page of payments plus ledger totals.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 payments:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Payment' }
 *                 summary: { $ref: '#/components/schemas/PaymentSummary' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/provider',
  authenticate,
  authorize(UserRole.HOTEL_OWNER, UserRole.PHOTOGRAPHER, UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  listProviderPayments,
);

router.post('/', authenticate, createPayment);

/**
 * @openapi
 * /payments/booking/{bookingId}:
 *   get:
 *     tags: [Payments]
 *     summary: Read the payment attached to a booking
 *     description: Readable by the guest who booked, the provider that owns the booked resource, and admins.
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The payment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Payments]
 *     summary: Update the payment attached to a booking
 *     description: >-
 *       Only the provider that owns the booked resource, or an admin, may change
 *       a payment — a guest cannot mark their own booking as paid. Completing a
 *       payment requires a confirmed or completed booking and records
 *       `payment_date`.
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentStatusInput'
 *     responses:
 *       200:
 *         description: Updated payment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The booking is not confirmed yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/booking/:bookingId', authenticate, getPaymentByBooking);
router.put('/booking/:bookingId', authenticate, updatePayment);

/**
 * @openapi
 * /payments/checkout:
 *   post:
 *     tags: [Payments]
 *     summary: Start a hosted SSLCommerz checkout
 *     description: |
 *       Opens (or resumes) a payment session on SSLCommerz's hosted page and
 *       returns the URL to send the customer to.
 *
 *       No amount is accepted from the client. The API re-reads the booking's
 *       stored price snapshot and uses that figure, so the total cannot be
 *       lowered by tampering with the request. Only the guest who made the
 *       booking, or an admin, may start a checkout.
 *
 *       A booking has exactly one payment row; retrying reuses it and appends a
 *       new transaction attempt, so an abandoned checkout never breaks the
 *       one-payment-per-booking rule.
 *
 *       `accept_terms` must be literally `true` — it records the customer's
 *       consent before any charge is attempted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CheckoutInput'
 *     responses:
 *       201:
 *         description: Checkout session opened.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 checkout: { $ref: '#/components/schemas/CheckoutSession' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The booking is not payable, is already paid, or is already refunded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: Online payment is not configured on this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/checkout', authenticate, startCheckout);

/**
 * @openapi
 * /payments/checkout/quote/{bookingId}:
 *   get:
 *     tags: [Payments]
 *     summary: Read the amount a checkout would charge
 *     description: |
 *       Returns the server-calculated total for a booking without opening a
 *       gateway session, so the checkout screen can show the price and the
 *       refundable balance before the customer commits.
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Checkout quote.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 quote: { $ref: '#/components/schemas/CheckoutQuote' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The booking has no payable amount.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/checkout/quote/:bookingId', authenticate, getCheckoutQuote);

/**
 * @openapi
 * /payments/{paymentId}/refunds:
 *   get:
 *     tags: [Payments]
 *     summary: List the refunds on a payment
 *     description: |
 *       Readable by an admin, or by the provider who owns the booked resource.
 *       A refund is looked up by payment id rather than booking id so a
 *       partially refunded booking, which can hold several refunds, is
 *       unambiguous.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Refunds recorded against the payment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 refunds:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Refund' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   post:
 *     tags: [Payments]
 *     summary: Refund a captured payment
 *     description: |
 *       Sends a refund to SSLCommerz against the original bank transaction.
 *       Allowed for admins and for the provider who owns the booked resource,
 *       but only on a payment that was actually captured.
 *
 *       The refundable ceiling is enforced by the API, not the gateway: the sum
 *       of every refund on a payment can never exceed the amount captured, so
 *       partial refunds accumulate safely. Omitting `amount` refunds the whole
 *       remaining balance.
 *
 *       A refund the gateway accepts but has not yet settled stays `processing`
 *       and is settled by polling `POST /payments/{paymentId}/refunds/{reference}/refresh`.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefundInput'
 *     responses:
 *       201:
 *         description: Refund submitted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 refund:
 *                   type: object
 *                   properties:
 *                     refundReference: { type: string, example: RFD-9c1b2a3d4e5f }
 *                     amountMinor: { type: integer, example: 480000 }
 *                     status: { type: string, example: processing }
 *                 payment: { $ref: '#/components/schemas/Payment' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The payment is not refundable, is already refunded, or has no gateway transaction.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:paymentId/refunds', authenticate, listRefunds);
router.post('/:paymentId/refunds', authenticate, startRefund);

/**
 * @openapi
 * /payments/{paymentId}/refunds/{reference}/refresh:
 *   post:
 *     tags: [Payments]
 *     summary: Poll the gateway for an in-flight refund
 *     description: |
 *       Asks SSLCommerz whether a previously submitted refund has settled, and
 *       moves the parent payment to `partially_refunded` or `refunded` when it
 *       has. Settlement is recomputed from every succeeded refund rather than
 *       incremented, so polling repeatedly cannot double count.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: reference
 *         required: true
 *         schema: { type: string }
 *         description: Our own `refund_reference`.
 *     responses:
 *       200:
 *         description: Refund state after polling.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 refund:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: refunded }
 *                     amountMinor: { type: integer, example: 480000 }
 *                 payment: { $ref: '#/components/schemas/Payment' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The gateway never accepted this refund, so there is nothing to poll.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:paymentId/refunds/:reference/refresh', authenticate, refreshRefundStatus);

/**
 * @openapi
 * /payments/{paymentId}/invoice:
 *   get:
 *     tags: [Payments]
 *     summary: Get the invoice for a captured payment
 *     description: |
 *       Returns the invoice line items for a captured payment and, as a side
 *       effect, allocates the invoice number and renders the PDF if they do not
 *       exist yet. Readable by the guest who booked, the owning provider, and
 *       admins. Only available once the payment has been captured.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 invoice:
 *                   type: object
 *                   properties:
 *                     invoiceNumber: { type: string, example: INV-2025-000123 }
 *                     issuedAt: { type: string, format: date-time }
 *                     paymentStatus: { type: string, example: successful }
 *                     paymentMethod: { type: string, example: card }
 *                     gateway: { type: string, example: sslcommerz }
 *                     currency: { type: string, example: BDT }
 *                     total: { type: string, example: 'BDT 4,800.00' }
 *                     bookingReference: { type: string, example: BKG-7F3A2C }
 *                     stayWindow: { type: string, example: '2026-01-04 → 2026-01-07' }
 *                     guestName: { type: string }
 *                     propertyName: { type: string }
 *                     refunded: { type: string, nullable: true }
 *                     downloadAvailable: { type: boolean }
 *                     lines:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label: { type: string }
 *                           detail: { type: string, nullable: true }
 *                           amount: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The payment has not been captured, so no invoice exists yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:paymentId/invoice', authenticate, getInvoice);

/**
 * @openapi
 * /payments/{paymentId}/invoice.pdf:
 *   get:
 *     tags: [Payments]
 *     summary: Download the invoice as a PDF
 *     description: |
 *       Streams the rendered PDF for a captured payment. Access is identical to
 *       `/payments/{paymentId}/invoice`; the file is generated on first request
 *       and reused afterwards.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The invoice PDF.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The payment has not been captured, so no invoice exists yet.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:paymentId/invoice.pdf', authenticate, downloadInvoice);

export default router;
