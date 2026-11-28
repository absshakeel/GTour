import { Response, NextFunction } from 'express';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import { assertObjectId } from '../utils/http';
import {
  addSubscriber,
  subscriberCount,
  writeHeartbeat,
} from '../services/notification/notificationHub.service';
import { NotificationType } from '@gtour/shared-types';
import type {
  NotificationDto,
  NotificationEmailStatus,
  NotificationSummaryResponse,
  NotificationsResponse,
} from '@gtour/shared-types';

/**
 * Reading and acknowledging notifications.
 *
 * Every query is scoped to `req.user.userId` in the filter itself rather than
 * being checked after the read, so a guessed id can never return or mutate
 * another account's row.
 */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const NOTIFICATION_TYPES = new Set<string>(Object.values(NotificationType));

function toDto(notification: {
  _id: unknown;
  user_id: unknown;
  type: string;
  title: string;
  body: string;
  link?: string;
  booking_id?: unknown;
  payment_id?: unknown;
  destination_id?: unknown;
  actionable?: boolean;
  read_at?: Date;
  email_status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}): NotificationDto {
  return {
    _id: String(notification._id),
    user_id: String(notification.user_id),
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    booking_id: notification.booking_id ? String(notification.booking_id) : undefined,
    payment_id: notification.payment_id ? String(notification.payment_id) : undefined,
    destination_id: notification.destination_id ? String(notification.destination_id) : undefined,
    actionable: Boolean(notification.actionable),
    read_at: notification.read_at ? new Date(notification.read_at).toISOString() : undefined,
    email_status: notification.email_status as NotificationEmailStatus | undefined,
    created_at: new Date(notification.createdAt ?? Date.now()).toISOString(),
    updated_at: new Date(notification.updatedAt ?? Date.now()).toISOString(),
  };
}

function readPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/** `GET /notifications` — newest first, with the unread count for the bell badge. */
export const listNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const page = readPositiveInt(req.query.page, 1, 1000);
    const limit = readPositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const filter: Record<string, unknown> = { user_id: req.user.userId };

    if (req.query.unread === 'true') filter.read_at = { $exists: false };

    if (typeof req.query.type === 'string' && req.query.type) {
      // Reject unknown types instead of silently returning an empty page: a bad
      // filter is a client bug, and a 200 would hide it.
      if (!NOTIFICATION_TYPES.has(req.query.type)) {
        throw new ApiError('Unknown notification type', 400, 'VALIDATION_ERROR', {
          type: req.query.type,
          allowed: [...NOTIFICATION_TYPES],
        });
      }
      filter.type = req.query.type;
    }

    const [rows, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user_id: req.user.userId, read_at: { $exists: false } }),
    ]);

    const payload: NotificationsResponse = {
      success: true,
      notifications: rows.map((row) => toDto(row)),
      unread,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/** `GET /notifications/summary` — the cheap poll for the bell badge. */
export const getNotificationSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const [unread, items] = await Promise.all([
      Notification.countDocuments({ user_id: req.user.userId, read_at: { $exists: false } }),
      // `timestamps: true` gives the collection `createdAt`; there is no
      // `created_at` field, so sorting by that name silently returned an
      // arbitrary order instead of the newest rows.
      Notification.find({ user_id: req.user.userId }).sort({ createdAt: -1 }).limit(8),
    ]);

    const payload: NotificationSummaryResponse = {
      success: true,
      unread,
      items: items.map((row) => toDto(row)),
    };

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/** `PATCH /notifications/:id/read` — idempotent, ownership enforced in the filter. */
export const markNotificationRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const id = assertObjectId(req.params.id, 'notification id');
    const updated = await Notification.findOneAndUpdate(
      { _id: id, user_id: req.user.userId, read_at: { $exists: false } },
      { $set: { read_at: new Date() } },
      { new: true },
    );

    if (!updated) {
      // Distinguish "not yours" from "already read": the first is an error, the
      // second is success, because the client asked for a state it already has.
      const existing = await Notification.findOne({ _id: id, user_id: req.user.userId });
      if (!existing) throw new ApiError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');

      res.json({ success: true, notification: toDto(existing) });
      return;
    }

    res.json({ success: true, notification: toDto(updated) });
  } catch (error) {
    next(error);
  }
};

/** `POST /notifications/read-all` */
export const markAllNotificationsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');

    const result = await Notification.updateMany(
      { user_id: req.user.userId, read_at: { $exists: false } },
      { $set: { read_at: new Date() } },
    );

    res.json({ success: true, updated: result.modifiedCount ?? 0, unread: 0 });
  } catch (error) {
    next(error);
  }
};

/** `GET /notifications/stream` — one long-lived SSE connection per open tab. */
export const streamNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401, 'NOT_AUTHENTICATED');
    if (Number(req.query?.count) === 1) {
      res.json({ success: true, subscribers: subscriberCount(req.user.userId) });
      return;
    }

    const userId = req.user.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx buffers proxied responses by default, which would hold every event
    // until the connection closed.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // The client needs the current badge count immediately, before the first
    // change arrives, so it does not have to make a second request on connect.
    const unread = await Notification.countDocuments({ user_id: userId, read_at: { $exists: false } });
    res.write(`event: ready\ndata: ${JSON.stringify({ unread, subscribers: subscriberCount(userId) })}\n\n`);

    const dispose = addSubscriber(userId, res);
    const heartbeat = setInterval(() => writeHeartbeat(res), 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      dispose();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    // Keep the handler suspended: the request never completes on its own, and
    // returning here would tell Express the response is finished.
    await new Promise<void>((resolve) => {
      res.on('close', resolve);
      res.on('error', resolve);
    });
  } catch (error) {
    next(error);
  }
};

/** Health probe used by the admin console and by tests. */
export const notificationStreamStatus = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.json({ success: true, subscribers: subscriberCount() });
  } catch (error) {
    next(error);
  }
};
