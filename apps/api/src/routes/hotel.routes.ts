import { Router } from 'express';
import {
  createHotel,
  deleteHotel,
  getAllHotels,
  getHotelById,
  getMyHotels,
  searchHotels,
  updateHotel,
} from '../controllers/hotel.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /hotels:
 *   get:
 *     tags: [Hotels]
 *     summary: List hotels
 *     description: |
 *       Discovery endpoint shared by `/hotels` and `/hotels/search`. Every hotel
 *       is returned with its destination populated plus the derived
 *       `price_from` / `price_to` range across its rooms.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: destination_id
 *         in: query
 *         description: Restrict to hotels attached to one destination.
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string, example: Sundarbans }
 *       - name: min_rating
 *         in: query
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - name: min_price
 *         in: query
 *         description: Applies to room prices; only hotels with a matching room are kept.
 *         schema: { type: number }
 *       - name: max_price
 *         in: query
 *         schema: { type: number }
 *       - name: guests
 *         in: query
 *         schema: { type: integer, minimum: 1 }
 *       - name: check_in
 *         in: query
 *         description: Requires `check_out`; only hotels with inventory for every night are kept.
 *         schema: { type: string, example: '2026-01-12' }
 *       - name: check_out
 *         in: query
 *         schema: { type: string, example: '2026-01-15' }
 *       - name: sort_by
 *         in: query
 *         schema: { type: string, enum: [rating, price, name, created_at], default: rating }
 *       - name: sort_order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: A page of hotels.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotels:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Hotel'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *   post:
 *     tags: [Hotels]
 *     summary: Create a hotel (owner or admin)
 *     description: The owner is taken from the token, never from the body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HotelInput'
 *     responses:
 *       201:
 *         description: Hotel created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotel:
 *                   $ref: '#/components/schemas/Hotel'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', getAllHotels);

/**
 * @openapi
 * /hotels/search:
 *   get:
 *     tags: [Hotels]
 *     summary: Search hotels
 *     description: Alias of `GET /hotels`; both accept the same query string.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: destination_id
 *         in: query
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: min_rating
 *         in: query
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - name: min_price
 *         in: query
 *         schema: { type: number }
 *       - name: max_price
 *         in: query
 *         schema: { type: number }
 *       - name: guests
 *         in: query
 *         schema: { type: integer, minimum: 1 }
 *       - name: check_in
 *         in: query
 *         schema: { type: string, example: '2026-01-12' }
 *       - name: check_out
 *         in: query
 *         schema: { type: string, example: '2026-01-15' }
 *       - name: sort_by
 *         in: query
 *         schema: { type: string, enum: [rating, price, name, created_at], default: rating }
 *       - name: sort_order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Matching hotels.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotels:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Hotel'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/search', searchHotels);

/**
 * @openapi
 * /hotels/mine:
 *   get:
 *     tags: [Hotels]
 *     summary: List the signed-in owner's hotels
 *     description: Backs the owner dashboard. An admin sees every hotel.
 *     responses:
 *       200:
 *         description: The caller's hotels.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotels:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Hotel'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/mine', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), getMyHotels);

/**
 * @openapi
 * /hotels/{id}:
 *   get:
 *     tags: [Hotels]
 *     summary: Read one hotel
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The hotel with its destination and price range.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotel:
 *                   $ref: '#/components/schemas/Hotel'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Hotels]
 *     summary: Update a hotel (owner of the record, or admin)
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HotelInput'
 *     responses:
 *       200:
 *         description: Updated hotel.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 hotel:
 *                   $ref: '#/components/schemas/Hotel'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Hotels]
 *     summary: Delete a hotel (owner of the record, or admin)
 *     description: Rooms attached to the hotel are removed with it.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Hotel deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Hotel deleted successfully }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getHotelById);

router.post('/', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), createHotel);
router.put('/:id', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), updateHotel);
router.delete('/:id', authenticate, authorize(UserRole.HOTEL_OWNER, UserRole.ADMIN), deleteHotel);

export default router;
