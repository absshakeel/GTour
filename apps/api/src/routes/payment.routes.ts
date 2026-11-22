import { Router } from 'express';
import { getPaymentByBooking, createPayment, updatePayment } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router: Router = Router();

/**
 * @openapi
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Record a payment for a booking
 *     description: |
 *       Payments are recorded, not processed — the proposal excludes an
 *       international gateway. `currency` defaults to BDT.
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
 */
router.post('/', authenticate, createPayment);

/**
 * @openapi
 * /payments/booking/{bookingId}:
 *   get:
 *     tags: [Payments]
 *     summary: Read the payment attached to a booking
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Payments]
 *     summary: Update the payment attached to a booking
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/booking/:bookingId', authenticate, getPaymentByBooking);
router.put('/booking/:bookingId', authenticate, updatePayment);

export default router;
