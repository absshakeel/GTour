import { Router } from 'express';
import {
  cancelBooking,
  createBooking,
  getBookingById,
  getProviderBookings,
  getUserBookings,
  listBookings,
  updateBooking,
  updateBookingStatus,
} from '../controllers/booking.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a booking
 *     description: |
 *       The server owns the whole transaction: it re-reads the room, validates
 *       the stay, prices it from live inventory, holds the nights atomically,
 *       and only then persists the booking with that price snapshot. A
 *       client-supplied `total_amount` is only a cross-check — a mismatch is
 *       rejected with `PRICE_MISMATCH`. A guest may not double-book the same
 *       nights; inventory is reserved with an atomic update so two concurrent
 *       requests cannot both succeed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingInput'
 *     responses:
 *       201:
 *         description: Booking confirmed and inventory held.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 booking:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: The nights are no longer available, or the supplied total does not match the server price.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authenticate, createBooking);

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List every booking (admin only)
 *     description: |
 *       The platform-wide booking ledger, newest stay first. Unlike
 *       `/bookings/provider`, this endpoint is not scoped to owned resources,
 *       so it is restricted to admins. `search` matches the booking reference
 *       case-insensitively; `date_from` / `date_to` filter on the stay start
 *       date.
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, completed, cancelled, no_show]
 *       - name: booking_type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [hotel, photography, vehicle]
 *       - name: search
 *         in: query
 *         description: Case-insensitive match on the booking reference.
 *         schema: { type: string }
 *       - name: date_from
 *         in: query
 *         description: Earliest stay start date (ISO 8601).
 *         schema: { type: string, format: date }
 *       - name: date_to
 *         in: query
 *         description: Latest stay start date (ISO 8601).
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: One page of bookings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 bookings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authenticate, authorize(UserRole.ADMIN), listBookings);

/**
 * @openapi
 * /bookings/user:
 *   get:
 *     tags: [Bookings]
 *     summary: List the signed-in guest's bookings
 *     description: |
 *       Backs the tourist dashboard. Each booking carries its hotel with the
 *       destination populated (`hotel_id.destination_id`), so the UI can group
 *       trips by destination without extra requests.
 *     responses:
 *       200:
 *         description: The caller's bookings, newest stay first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 bookings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/user', authenticate, getUserBookings);

/**
 * @openapi
 * /bookings/provider:
 *   get:
 *     tags: [Bookings]
 *     summary: List bookings for the signed-in provider's resources
 *     description: |
 *       Returns hotel, photography and vehicle bookings whose underlying
 *       resource belongs to the caller. A hotel owner sees only their property,
 *       a photographer only their shoots, a vehicle provider only their fleet.
 *       An admin sees every booking. Each row carries a trimmed `payment`
 *       object, or `null`, so the queue can show settlement state without a
 *       second request per booking.
 *     responses:
 *       200:
 *         description: The provider queue.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 bookings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/provider',
  authenticate,
  authorize(UserRole.HOTEL_OWNER, UserRole.PHOTOGRAPHER, UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  getProviderBookings,
);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Read one booking
 *     description: A guest may only read their own booking; a provider may only read bookings for their own property.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The booking.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 booking:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Bookings]
 *     summary: Edit a pending booking
 *     description: Guests may only change free-text notes, and only while the booking is still pending.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingUpdateInput'
 *     responses:
 *       200:
 *         description: Updated booking.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 booking:
 *                   $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The booking is no longer pending.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     tags: [Bookings]
 *     summary: Cancel a booking
 *     description: Thin wrapper over `PATCH /bookings/{id}/status` with `status` set to `cancelled`. Held nights are released before the status is written.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 300 }
 *     responses:
 *       200:
 *         description: Booking cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 booking:
 *                   $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The current status cannot transition to `cancelled`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authenticate, getBookingById);
router.put('/:id', authenticate, updateBooking);

/**
 * @openapi
 * /bookings/{id}/status:
 *   patch:
 *     tags: [Bookings]
 *     summary: Move a booking through its workflow
 *     description: |
 *       Shared by guests and providers. A guest may only cancel; a provider may
 *       confirm, complete, cancel or flag a no-show on their own property.
 *       Illegal transitions are rejected with `INVALID_STATUS_TRANSITION` and the
 *       list of allowed next statuses. Cancelling releases the held nights.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingStatusInput'
 *     responses:
 *       200:
 *         description: Updated booking.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 booking:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Illegal status transition.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/status', authenticate, updateBookingStatus);
router.delete('/:id', authenticate, cancelBooking);

export default router;
