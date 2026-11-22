import { Router } from 'express';
import { getAllServices, getServiceById, createPhotographyService, updatePhotographyService, deletePhotographyService } from '../controllers/photographyService.controller';

const router: Router = Router();

/**
 * @openapi
 * /photography-services:
 *   get:
 *     tags: [Photography Services]
 *     summary: List photography packages
 *     description: Sorted by price. The photographer is populated with `name` and `profile_image`.
 *     security: []
 *     responses:
 *       200:
 *         description: All packages.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 services:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PhotographyService'
 *   post:
 *     tags: [Photography Services]
 *     summary: Create a photography package
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotographyServiceInput'
 *     responses:
 *       201:
 *         description: Package created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 service:
 *                   $ref: '#/components/schemas/PhotographyService'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', getAllServices);

/**
 * @openapi
 * /photography-services/{id}:
 *   get:
 *     tags: [Photography Services]
 *     summary: Read one package and its portfolio
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: The package plus portfolio entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 service:
 *                   $ref: '#/components/schemas/PhotographyService'
 *                 portfolio:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Portfolio'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     tags: [Photography Services]
 *     summary: Update a photography package
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotographyServiceInput'
 *     responses:
 *       200:
 *         description: Updated package.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 service:
 *                   $ref: '#/components/schemas/PhotographyService'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Photography Services]
 *     summary: Delete a photography package and its portfolio
 *     description: '⚠️ Currently unauthenticated — no ownership check yet; tracked as a follow-up.'
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Package deleted; portfolio entries are cascaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Service deleted successfully }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', getServiceById);
router.post('/', createPhotographyService);
router.put('/:id', updatePhotographyService);
router.delete('/:id', deletePhotographyService);

export default router;
