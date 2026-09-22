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
  icon?: React.ComponentType<any>;
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
        const n = res.filter((no) => {
          if (!userInfo?.read_notifications[no.id]) {
            return true;
          }
          return !userInfo.read_notifications[no.id].is_deleted;
        });
        const transformedNotifications = n.map((notification: Notification) => {
          if (!userInfo?.read_notifications[notification.id]) {
            return notification;
          }

          return { ...notification, is_read: true };
        });
        setNotifications(transformedNotifications);
      } catch (e) {
        setNotifications([]);
      } finally {
        setNotificationLoading(false);
      }
    };

    fetchNotification();
  }, [user?.id]);

  return (
    <NotificationContext.Provider
      value={{ notifications, setNotifications, notificationLoading }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
