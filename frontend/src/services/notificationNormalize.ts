import type { Notification } from "../context/NotificationContext";

/**
 * Pure, dependency-free normalization of notification-list payloads.
 *
 * Backend contract (notification_handler.go):
 *   GET /api/notification/recipient/:id -> {"notifications": [...]}
 *   GET /api/notification/              -> {"notifications": [...]}
 * Verified against the live API: a populated recipient returns
 * {"notifications":[{id,recipient_id,title,message,is_read,sent_at,type},...]},
 * an empty one returns {"notifications":[]}. A nil Go slice would also marshal
 * as JSON `null`, and consumers must never receive a non-array from the
 * service layer (`res.data.notifications || res.data` yields the raw object
 * when `notifications` is null, which breaks .filter/.map downstream).
 */
export function normalizeNotifications(payload: unknown): Notification[] {
  let candidate = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    candidate = (candidate as { notifications?: unknown }).notifications;
  }
  return Array.isArray(candidate) ? (candidate as Notification[]) : [];
}
