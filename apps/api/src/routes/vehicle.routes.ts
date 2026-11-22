import { Router } from 'express';
import { getAllVehicles, getVehicleById, createVehicle, updateVehicle, deleteVehicle, getVehicleAvailability, createVehicleAvailability } from '../controllers/vehicle.controller';

const router: Router = Router();

/**
 * @openapi
 * /vehicles:
 *   get:
 *     tags: [Vehicles]
 *     summary: List rental vehicles
 *     description: Sorted by daily price. The provider is populated with its `name`.
 *     security: []
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
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
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
 *     security: []
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
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
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
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
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
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

/**
 * @openapi
 * /vehicles/{id}/availability:
 *   get:
 *     tags: [Vehicles]
 *     summary: Read vehicle availability
 *     description: Without `date`, returns every row from today onwards.
 *     security: []
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
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
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
router.get('/:id/availability', getVehicleAvailability);
router.post('/:id/availability', createVehicleAvailability);

export default router;
