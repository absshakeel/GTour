import { Router } from 'express';
import {
  getPortfolioByService,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../controllers/portfolio.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@gtour/shared-types';

const router: Router = Router();

/**
 * @openapi
 * /portfolio:
 *   post:
 *     tags: [Portfolio]
 *     summary: Publish a portfolio entry for one of your services
 *     description: >
 *       Replaces the gallery for that service, because the ERD allows one
 *       portfolio entry per service. The service must belong to the signed-in
 *       photographer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [service_id, images]
 *             properties:
 *               service_id: { type: string, example: 6751f1c2a9d3e4b5c6d7e8f9 }
 *               description: { type: string, maxLength: 500 }
 *               images:
 *                 type: array
 *                 items: { type: string, format: uri }
 *     responses:
 *       201:
 *         description: Portfolio entry upserted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 portfolio:
 *                   $ref: '#/components/schemas/Portfolio'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', authenticate, authorize(UserRole.PHOTOGRAPHER, UserRole.ADMIN), createPortfolio);

/**
 * @openapi
 * /portfolio/service/{serviceId}:
 *   get:
 *     tags: [Portfolio]
 *     summary: List the portfolio gallery for a service
 *     security: []
 *     parameters:
 *       - name: serviceId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Portfolio entries for the service.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 portfolio:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Portfolio'
 */
router.get('/service/:serviceId', getPortfolioByService);

/**
 * @openapi
 * /portfolio/{id}:
 *   put:
 *     tags: [Portfolio]
 *     summary: Update a portfolio entry
 *     description: Only the owning photographer (or an admin) may change the gallery.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string, maxLength: 500 }
 *               images:
 *                 type: array
 *                 items: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Updated portfolio entry.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Portfolio]
 *     summary: Delete a portfolio entry
 *     description: Only the owning photographer (or an admin) may delete the entry.
 *     parameters:
 *       - $ref: '#/components/parameters/MongoId'
 *     responses:
 *       200:
 *         description: Portfolio entry deleted.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id', authenticate, authorize(UserRole.PHOTOGRAPHER, UserRole.ADMIN), updatePortfolio);
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.PHOTOGRAPHER, UserRole.ADMIN),
  deletePortfolio,
);

export default router;
