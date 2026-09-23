import api from "./api";
import { normalizeNotifications } from "./notificationNormalize";
import type { Notification } from "../context/NotificationContext";

export async function getNotification(
  userId: string | number
): Promise<Notification[]> {
  // GET /api/notification/recipient/:id -> {"notifications": [...]}
  // (see notification_handler.go); normalize always yields an array.
  const res = await api.get(`/notification/recipient/${userId}`);
  return normalizeNotifications(res.data);
}

export async function markNotificationAsRead(notificationId: string) {
  const res = await api.patch(`/notification/${notificationId}`, {
    is_read: true,
  });
  return res.data;
}
