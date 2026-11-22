import { Router } from 'express';
import { getAllPhotographers, getPhotographerById, createPhotographer, updatePhotographer, deletePhotographer, getMyPhotographerProfile } from '../controllers/photographer.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /photographers:
 *   get:
 *     tags: [Photographers]
 *     summary: List photographers
 *     description: Sorted by rating. Each row has its destination populated so the directory can be filtered by destination client-side.
 *     security: []
 *     responses:
 *       200:
 *         description: All photographers.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 photographers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Photographer'
 *   post:
 *     tags: [Photographers]
 *     summary: Create a photographer profile
 *     description: |
 *       ⚠️ Currently unauthenticated and unowned — the record is created without
 *       a `user_id`, so it cannot be reached from a provider workspace. Securing
 *       this route is tracked as a follow-up.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotographerInput'
 *     responses:
 *       201:
 *         description: Photographer created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 photographer:
 *                   $ref: '#/components/schemas/Photographer'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', getAllPhotographers);

/**
 * @openapi
 * /photographers/mine:
 *   get:
 *     tags: [Photographers]
 *     summary: Provider workspace for the signed-in photographer
 *     description: |
 *       Returns the caller's photographer profile plus its services, portfolio
 *       and shoot bookings. Rows seeded before `user_id` existed are matched once
 *       by account email and linked permanently. An admin gets `null` here and
 *       should use `/photographers` instead.
 *     responses:
 *       200:
 *         description: Workspace payload; `photographer` is `null` when the account owns no profile yet.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 photographer:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Photographer'
 *                   nullable: true
 *                 services:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PhotographyService'
 *                 portfolio:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Portfolio'
 *                 bookings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/mine', authenticate, authorize(UserRole.PHOTOGRAPHER, UserRole.ADMIN), getMyPhotographerProfile);

/**
 * @openapi
 * /photographers/{id}:
 *   get:
 *     tags: [Photographers]
 *     summary: Read one photographer and their services
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The photographer plus their packages.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 photographer:
 *                   $ref: '#/components/schemas/Photographer'
 *                 services:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PhotographyService'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Photographers]
 *     summary: Update a photographer profile
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotographerInput'
 *     responses:
 *       200:
 *         description: Updated photographer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 photographer:
 *                   $ref: '#/components/schemas/Photographer'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Photographers]
 *     summary: Delete a photographer profile and its services
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Photographer deleted; services and portfolio entries are cascaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Photographer deleted successfully }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getPhotographerById);
router.post('/', createPhotographer);
router.put('/:id', updatePhotographer);
router.delete('/:id', deletePhotographer);

export default router;
