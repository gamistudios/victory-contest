import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useTelegram } from "../hooks/useTelegram";
import { getNotification } from "../services/notificationService";
import { useAuth } from "./AuthContext";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  sent_at: string;
  is_read: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  color?: string;
  actionUrl?: string;
}

interface NotificationContextProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  notificationLoading: boolean;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(
  undefined
);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error("useNotification must be used within NotificationProvider");
  return context;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const { user } = useTelegram();
  const { user: userInfo } = useAuth();

  useEffect(() => {
    const fetchNotification = async () => {
      if (!user?.id) return;
      setNotificationLoading(true);
      try {
        const res: Notification[] = await getNotification(user.id);
        const readNotifications = userInfo?.read_notifications ?? {};
        const n = res.filter((no) => !readNotifications[no.id]?.is_deleted);
        const transformedNotifications = n.map((notification: Notification) => {
          if (!readNotifications[notification.id]) {
            return notification;
          }

          return { ...notification, is_read: true };
        });
        setNotifications(transformedNotifications);
      } catch {
        setNotifications([]);
      } finally {
        setNotificationLoading(false);
      }
    };

    fetchNotification();
  }, [user?.id, userInfo?.read_notifications]);

  return (
    <NotificationContext.Provider
      value={{ notifications, setNotifications, notificationLoading }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
