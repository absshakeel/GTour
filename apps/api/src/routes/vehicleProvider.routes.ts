import { Router } from 'express';
import {
  getAllProviders,
  getProviderById,
  createVehicleProvider,
  updateVehicleProvider,
  deleteVehicleProvider,
  getMyProviderProfile,
} from '../controllers/vehicleProvider.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /vehicle-providers:
 *   get:
 *     tags: [Vehicle Providers]
 *     summary: List vehicle providers
 *     description: Sorted by rating.
 *     responses:
 *       200:
 *         description: All providers.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 providers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VehicleProvider'
 *   post:
 *     tags: [Vehicle Providers]
 *     summary: Create a vehicle provider
 *     description: Only the owning provider (or an admin) may perform this action.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleProviderInput'
 *     responses:
 *       201:
 *         description: Provider created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 provider:
 *                   $ref: '#/components/schemas/VehicleProvider'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', getAllProviders);

/**
 * @openapi
 * /vehicle-providers/mine:
 *   get:
 *     tags: [Vehicle Providers]
 *     summary: Provider workspace for the signed-in operator
 *     description: |
 *       Returns the caller's provider profile plus its fleet, the next 120 days
 *       of availability and the vehicle bookings attached to that fleet. Rows
 *       seeded before `user_id` existed are matched once by account email.
 *     responses:
 *       200:
 *         description: Workspace payload; `provider` is `null` when the account owns no profile yet.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 provider:
 *                   allOf:
 *                     - $ref: '#/components/schemas/VehicleProvider'
 *                   nullable: true
 *                 vehicles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vehicle'
 *                 availability:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VehicleAvailability'
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
  '/mine',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  getMyProviderProfile,
);

/**
 * @openapi
 * /vehicle-providers/{id}:
 *   get:
 *     tags: [Vehicle Providers]
 *     summary: Read one provider and its fleet
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The provider plus its vehicles.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 provider:
 *                   $ref: '#/components/schemas/VehicleProvider'
 *                 vehicles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vehicle'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Vehicle Providers]
 *     summary: Update a provider
 *     description: Only the owning provider (or an admin) may perform this action.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleProviderInput'
 *     responses:
 *       200:
 *         description: Updated provider.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 provider:
 *                   $ref: '#/components/schemas/VehicleProvider'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Vehicle Providers]
 *     summary: Delete a provider and its fleet
 *     description: Only the owning provider (or an admin) may perform this action.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Provider deleted; its vehicles are cascaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Provider deleted successfully }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getProviderById);
router.post(
  '/',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  createVehicleProvider,
);
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  updateVehicleProvider,
);
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.VEHICLE_PROVIDER, UserRole.ADMIN),
  deleteVehicleProvider,
);

export default router;
