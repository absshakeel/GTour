import { Router } from 'express';
import {
  bulkUpsertRoomAvailability,
  createRoom,
  createRoomAvailability,
  deleteRoom,
  getRoomAvailability,
  getRoomById,
  getRoomQuote,
  getRoomsByHotel,
  updateRoom,
} from '../controllers/room.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /rooms/hotel/{hotelId}:
 *   get:
 *     tags: [Rooms]
 *     summary: List the rooms of one hotel
 *     security: []
 *     parameters:
 *       - name: hotelId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Rooms belonging to the hotel.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 rooms:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Room'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/hotel/:hotelId', getRoomsByHotel);

/**
 * @openapi
 * /rooms:
 *   post:
 *     tags: [Rooms]
 *     summary: Create a room (owner of the hotel, or admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomInput'
 *     responses:
 *       201:
 *         description: Room created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 room:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), createRoom);

/**
 * @openapi
 * /rooms/{id}/quote:
 *   get:
 *     tags: [Rooms]
 *     summary: Authoritative price quote for a stay
 *     description: |
 *       The only place a booking total is computed. The booking UI calls this
 *       before creating a booking so the number it shows is the server's number.
 *       Rejects a stay that exceeds the room capacity.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *       - name: check_in
 *         in: query
 *         required: true
 *         schema: { type: string, example: '2026-01-12' }
 *       - name: check_out
 *         in: query
 *         required: true
 *         schema: { type: string, example: '2026-01-15' }
 *       - name: rooms
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 1 }
 *       - name: guests
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 1 }
 *     responses:
 *       200:
 *         description: The quote.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 quote:
 *                   $ref: '#/components/schemas/RoomQuote'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/quote', getRoomQuote);

/**
 * @openapi
 * /rooms/{id}/availability:
 *   get:
 *     tags: [Rooms]
 *     summary: Nightly availability calendar for a room
 *     description: |
 *       Every night in the window is returned, including nights with no stored
 *       override (which fall back to the room's own inventory), so the UI can
 *       render a continuous calendar. Defaults to the next 30 days, capped at 120.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *       - name: from
 *         in: query
 *         schema: { type: string, example: '2026-01-12' }
 *       - name: to
 *         in: query
 *         schema: { type: string, example: '2026-02-11' }
 *     responses:
 *       200:
 *         description: The calendar.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomCalendar'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   post:
 *     tags: [Rooms]
 *     summary: Set inventory for a single night (owner of the hotel, or admin)
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomAvailabilityInput'
 *     responses:
 *       201:
 *         description: The stored availability row.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 availability:
 *                   $ref: '#/components/schemas/RoomAvailability'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/availability', getRoomAvailability);
router.post(
  '/:id/availability',
  authenticate,
  authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN),
  createRoomAvailability
);

/**
 * @openapi
 * /rooms/{id}/availability/bulk:
 *   post:
 *     tags: [Rooms]
 *     summary: Publish inventory for a whole date range (owner of the hotel, or admin)
 *     description: One provider action writes one availability row per night between `start_date` and `end_date`.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomAvailabilityBulkInput'
 *     responses:
 *       200:
 *         description: Number of nights written.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 updated: { type: integer, example: 9 }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/availability/bulk',
  authenticate,
  authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN),
  bulkUpsertRoomAvailability
);

/**
 * @openapi
 * /rooms/{id}:
 *   get:
 *     tags: [Rooms]
 *     summary: Read one room
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The room.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 room:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Rooms]
 *     summary: Update a room (owner of the hotel, or admin)
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomInput'
 *     responses:
 *       200:
 *         description: Updated room.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 room:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Rooms]
 *     summary: Delete a room (owner of the hotel, or admin)
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Room deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Room deleted successfully }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getRoomById);
router.put('/:id', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), updateRoom);
router.delete('/:id', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), deleteRoom);

export default router;
