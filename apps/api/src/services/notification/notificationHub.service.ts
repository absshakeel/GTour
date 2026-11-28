import type { Response } from 'express';
import type { INotification } from '../../models/Notification';

/**
 * In-process fan-out for live notifications.
 *
 * A browser opens one `text/event-stream` connection per signed-in tab and the
 * registry keeps a set of open responses per user. The API runs as a single
 * process (see the deployment notes), so a plain map is enough; a multi-instance
 * deployment would need to move this to Redis pub/sub, which is why every write
 * goes through {@link publishNotification} rather than touching responses
 * directly.
 */
const connections = new Map<string, Set<Response>>();

export interface NotificationStreamPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  booking_id?: string;
  payment_id?: string;
  destination_id?: string;
  actionable: boolean;
  created_at: string;
}

/** Wire shape of a notification, shared by the SSE stream and the REST list. */
export function serialiseNotification(notification: INotification): NotificationStreamPayload {
  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    booking_id: notification.booking_id ? String(notification.booking_id) : undefined,
    payment_id: notification.payment_id ? String(notification.payment_id) : undefined,
    destination_id: notification.destination_id ? String(notification.destination_id) : undefined,
    actionable: notification.actionable,
    created_at: new Date(notification.createdAt ?? Date.now()).toISOString(),
  };
}

/**
 * Registers an open stream and returns the disposer that unregisters it.
 *
 * Callers must invoke the returned function on both `close` and `error`: a
 * browser that navigates away or loses the network does not always emit both,
 * and a leaked response would be written to forever.
 */
export function addSubscriber(userId: string, res: Response): () => void {
  const existing = connections.get(userId) ?? new Set<Response>();
  existing.add(res);
  connections.set(userId, existing);

  return () => {
    const current = connections.get(userId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) connections.delete(userId);
  };
}

/**
 * Pushes an event to every open tab for a user.
 *
 * A failed write means that tab's socket is gone; it is dropped rather than
 * retried, because the notification is already persisted and the next page load
 * or reconnect reads it from the database.
 */
export function publishNotification(userId: string, payload: NotificationStreamPayload): void {
  const subscribers = connections.get(userId);
  if (!subscribers || subscribers.size === 0) return;

  const frame = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of [...subscribers]) {
    try {
      res.write(frame);
    } catch {
      subscribers.delete(res);
    }
  }

  if (subscribers.size === 0) connections.delete(userId);
}

/** Keeps intermediaries from closing an idle stream. */
export function writeHeartbeat(res: Response): void {
  try {
    res.write(': ping\n\n');
  } catch {
    // The close handler owns cleanup; a failed heartbeat needs no action here.
  }
}

/** Open stream count, used by tests and diagnostics. */
export function subscriberCount(userId?: string): number {
  if (userId) return connections.get(userId)?.size ?? 0;
  let total = 0;
  for (const set of connections.values()) total += set.size;
  return total;
}

/** Drops every stream. Tests call this between cases so state cannot leak. */
export function resetSubscribers(): void {
  connections.clear();
}
