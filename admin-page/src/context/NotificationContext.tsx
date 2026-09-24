// src/context/NotificationContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "@/services/api";

interface Notification {
  id: string;
  message: string;
  title: string;
  type: string;
  sent_at: string;
  is_read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  addNotification: (
    message: string,
    type: string,
    options?: { title?: string; recipientId?: string }
  ) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      // "admin" is the backend's admin-audience recipient bucket:
      // GetNotificationsByRecipientAfterRegistration special-cases it
      // (backend/internal/usecase/notification_usecase.go), producers send
      // to recipient_id "admin" (feedback_handler.go), and the repository
      // merges in "all" broadcasts. GET /api/notification/recipient/admin is
      // therefore the correct admin inbox endpoint; /api/notification/admin/
      // :admin_email would only match email-keyed rows that nothing writes.
      const response = await api.get("/api/notification/recipient/admin");
      const nots = response.data.notifications;
      setNotifications(nots);
      console.log(nots.filter((n: Notification) => !n.is_read).length);
      setUnreadCount(nots.filter((n: Notification) => !n.is_read).length);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  };

  const markAsRead = async () => {
    try {
      // Mark all unread notifications as read
      const unreadNotifications = notifications.filter((n) => !n.is_read);
      const markPromises = unreadNotifications.map((n) =>
        api.patch(`/api/notification/${n.id}/read`)
      );

      await Promise.all(markPromises);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark notifications as read", error);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await api.patch(`/api/notification/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/api/notification/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Recalculate unread count
      const newUnreadCount = notifications.filter(
        (n) => n.id !== id && !n.is_read
      ).length;
      setUnreadCount(newUnreadCount);
    } catch (error) {
      console.error("Failed to delete notification", error);
    }
  };

  const addNotification = async (
    message: string,
    type: string,
    options?: { title?: string; recipientId?: string }
  ) => {
    if (!user) return;
    try {
      // Body must match backend domain.Notification
      // (backend/internal/domain/notification.go). The gin route is
      // registered as POST("/") under /api/notification, so the URL needs
      // the trailing slash; without it the 301 redirect can drop the POST
      // body on some clients. Default recipient is the admin audience
      // bucket read by fetchNotifications; pass recipientId "all" to
      // broadcast to students.
      await api.post("/api/notification/", {
        recipient_id: options?.recipientId ?? "admin",
        title: options?.title ?? "Notification",
        message,
        is_read: false,
        sent_at: new Date().toISOString(),
        type,
      });
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to add notification", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markNotificationAsRead,
        deleteNotification,
        addNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
};
