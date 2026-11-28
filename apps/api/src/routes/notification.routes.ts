import { Router } from 'express';
import {
  getNotificationSummary,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationStreamStatus,
  streamNotifications,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router: Router = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the signed-in user's notifications, newest first
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *       - in: query
 *         name: unread
 *         schema: { type: string, enum: ['true'] }
 *         description: Only return unread rows.
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by notification type.
 *     responses:
 *       200:
 *         description: A page of notifications plus the account's unread count.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', authenticate, listNotifications);

/**
 * @openapi
 * /notifications/summary:
 *   get:
 *     tags: [Notifications]
 *     summary: Unread count and the most recent notifications
 *     description: The cheap call the header bell uses to draw its badge.
 *     responses:
 *       200:
 *         description: Unread count and up to eight recent notifications.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/summary', authenticate, getNotificationSummary);

/**
 * @openapi
 * /notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: Live notification stream (Server-Sent Events)
 *     description: |
 *       Keeps the connection open and pushes `notification` events as they are
 *       created for the signed-in account, after a `ready` event carrying the
 *       current unread count. A comment frame every 25 seconds keeps proxies
 *       from closing an idle stream.
 *     responses:
 *       200:
 *         description: An `text/event-stream` of notification frames.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/stream', authenticate, streamNotifications);

/**
 * @openapi
 * /notifications/stream/status:
 *   get:
 *     tags: [Notifications]
 *     summary: Count of open notification streams
 *     responses:
 *       200:
 *         description: Total open streams across all accounts.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/stream/status', authenticate, notificationStreamStatus);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark every unread notification as read
 *     responses:
 *       200:
 *         description: Number of rows updated.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/read-all', authenticate, markAllNotificationsRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The updated notification.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/:id/read', authenticate, markNotificationRead);

export default router;
