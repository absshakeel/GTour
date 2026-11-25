import { Router } from 'express';
import {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleAvailability,
  createVehicleAvailability,
  bulkUpsertVehicleAvailability,
  getVehicleQuote,
} from '../controllers/vehicle.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /vehicles:
 *   get:
 *     tags: [Vehicles]
 *     summary: List rental vehicles
 *     description: Sorted by daily price. The provider is populated with its `name`.
 *     responses:
 *       200:
 *         description: All vehicles.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 vehicles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vehicle'
 *   post:
 *     tags: [Vehicles]
 *     summary: Create a vehicle
 *     description: Only the owning provider (or an admin) may perform this action.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleInput'
 *     responses:
 *       201:
 *         description: Vehicle created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 vehicle:
 *                   $ref: '#/components/schemas/Vehicle'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', getAllVehicles);

/**
 * @openapi
 * /vehicles/{id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Read one vehicle
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The vehicle.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 vehicle:
 *                   $ref: '#/components/schemas/Vehicle'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Vehicles]
 *     summary: Update a vehicle
 *     description: Only the owning provider (or an admin) may perform this action.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleInput'
 *     responses:
 *       200:
 *         description: Updated vehicle.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 vehicle:
 *                   $ref: '#/components/schemas/Vehicle'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Vehicles]
 *     summary: Delete a vehicle and its availability rows
 *     description: Only the owning provider (or an admin) may perform this action.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Vehicle deleted; its availability rows are cascaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Vehicle deleted successfully }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getVehicleById);

/**
 * @openapi
 * /vehicles/{id}/quote:
 *   get:
 *     tags: [Vehicles]
 *     summary: Authoritative price quote for a rental
 *     description: |
 *       Computes the rental total on the server from live fleet availability.
 *       The client must never sum daily prices itself — this is the figure the
 *       booking endpoint will re-derive and charge.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: units
 *         schema: { type: integer, minimum: 1, maximum: 10, default: 1 }
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
 *                   type: object
 *                   properties:
 *                     currency: { type: string }
 *                     days: { type: integer }
 *                     units: { type: integer }
 *                     price_per_day: { type: number }
 *                     total: { type: number }
 *                     available: { type: boolean }
 *                     max_units: { type: integer }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Vehicle not found.
 */
router.get('/:id/quote', getVehicleQuote);
router.post('/', authenticate, authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN), createVehicle);
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  updateVehicle,
);
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  deleteVehicle,
);

/**
 * @openapi
 * /vehicles/{id}/availability:
 *   get:
 *     tags: [Vehicles]
 *     summary: Read vehicle availability
 *     description: Without `date`, returns every row from today onwards.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *       - name: date
 *         in: query
 *         description: Exact day to look up.
 *         schema: { type: string, format: date, example: '2026-01-12' }
 *     responses:
 *       200:
 *         description: Availability rows, soonest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 availability:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VehicleAvailability'
 *   post:
 *     tags: [Vehicles]
 *     summary: Publish availability for one day
 *     description: Only the owning provider (or an admin) may perform this action.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleAvailabilityInput'
 *     responses:
 *       201:
 *         description: Availability row created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 availability:
 *                   $ref: '#/components/schemas/VehicleAvailability'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
/**
 * @openapi
 * /vehicles/{id}/availability/bulk:
 *   post:
 *     tags: [Vehicles]
 *     summary: Publish availability for a date range
 *     description: >-
 *       Upserts one row per rental night from `start_date` up to (but excluding)
 *       `end_date` and returns how many rows were written. Only the owning provider (or an admin) may
 *       perform this action. `available_units` may not exceed the vehicle's fleet size.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleAvailabilityBulkInput'
 *     responses:
 *       200:
 *         description: Rows written for the requested range.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 updated: { type: integer, example: 7 }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/availability', getVehicleAvailability);
router.post(
  '/:id/availability',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  createVehicleAvailability,
);
router.post(
  '/:id/availability/bulk',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  bulkUpsertVehicleAvailability,
);

export default router;
