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
  addNotification: (message: string, type: string) => Promise<void>;
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

  const addNotification = async (message: string, type: string) => {
    if (!user) return;
    try {
      await api.post("/api/notification", { message, type });
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to add notification", error);
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
