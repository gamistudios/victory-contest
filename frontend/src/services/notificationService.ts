import api from "./api";

export async function getNotification(userId: string | number) {
  // Adjust the endpoint as per your backend API
  const res = await api.get(`/notification/recipient/${userId}`);
  return res.data.notifications || res.data;
}

export async function markNotificationAsRead(notificationId: string) {
  const res = await api.patch(`/notification/${notificationId}`, {
    is_read: true,
  });
  return res.data;
}

export async function deleteNotification(notificationId: string) {
  const res = await api.delete(`/notification/${notificationId}`);
  return res.data;
}
