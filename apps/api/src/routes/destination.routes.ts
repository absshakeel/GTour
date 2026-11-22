import { Router } from 'express';
import {
  getAllDestinations,
  getDestinationById,
  searchDestinations,
  getDestinationFilters,
  createDestination,
  updateDestination,
  deleteDestination,
} from '../controllers/destination.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router: Router = Router();

/**
 * @openapi
 * /destinations:
 *   get:
 *     tags: [Destinations]
 *     summary: List published destinations
 *     description: |
 *       Same filtering as `/destinations/search` but with the default sort
 *       applied. Archived destinations are never returned.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: category_id
 *         in: query
 *         schema: { type: string }
 *       - name: location_id
 *         in: query
 *         schema: { type: string }
 *       - name: min_rating
 *         in: query
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - name: max_budget
 *         in: query
 *         schema: { type: number }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: sort_by
 *         in: query
 *         schema: { type: string, enum: [rating, views, name, created_at], default: rating }
 *       - name: sort_order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: A page of destinations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 destinations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Destination'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *   post:
 *     tags: [Destinations]
 *     summary: Create a destination (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DestinationInput'
 *     responses:
 *       201:
 *         description: Destination created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 destination:
 *                   $ref: '#/components/schemas/Destination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', getAllDestinations);

/**
 * @openapi
 * /destinations/search:
 *   get:
 *     tags: [Destinations]
 *     summary: Search destinations by free text and facets
 *     description: |
 *       `search` matches the destination name and description. Every filter is
 *       optional and combines with AND.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: search
 *         in: query
 *         schema: { type: string, example: Sundarbans }
 *       - name: category_id
 *         in: query
 *         schema: { type: string }
 *       - name: location_id
 *         in: query
 *         schema: { type: string }
 *       - name: min_rating
 *         in: query
 *         schema: { type: number, minimum: 0, maximum: 5 }
 *       - name: max_budget
 *         in: query
 *         schema: { type: number }
 *       - name: sort_by
 *         in: query
 *         schema: { type: string, enum: [rating, views, name, created_at], default: rating }
 *       - name: sort_order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Matching destinations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 destinations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Destination'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/search', searchDestinations);

/**
 * @openapi
 * /destinations/filters:
 *   get:
 *     tags: [Destinations]
 *     summary: Facets used to build the discovery filter UI
 *     description: Returns every category and location so the client can render filter chips in one round trip.
 *     security: []
 *     responses:
 *       200:
 *         description: Categories and locations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 categories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Category'
 *                 locations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 */
router.get('/filters', getDestinationFilters);

/**
 * @openapi
 * /destinations/{id}:
 *   get:
 *     tags: [Destinations]
 *     summary: Read one destination
 *     description: Also increments the destination `views` counter.
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The destination with its category and location populated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 destination:
 *                   $ref: '#/components/schemas/Destination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Destinations]
 *     summary: Update a destination (admin)
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DestinationInput'
 *     responses:
 *       200:
 *         description: Updated destination.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 destination:
 *                   $ref: '#/components/schemas/Destination'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Destinations]
 *     summary: Archive a destination (admin)
 *     description: Soft delete — the row is stamped with `archived_at` and disappears from every read.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Destination archived.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Destination archived successfully }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getDestinationById);
router.post('/', authenticate, authorize('admin'), createDestination);
router.put('/:id', authenticate, authorize('admin'), updateDestination);
router.delete('/:id', authenticate, authorize('admin'), deleteDestination);

export default router;
