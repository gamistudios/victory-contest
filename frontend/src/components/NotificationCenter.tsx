import React from "react";
import { useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { useNotification } from "../context/NotificationContext";
import { markNotificationAsRead } from "../services/notificationService";
import { Bell, X, CheckCircle, Trophy, MessageSquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { updateUserInfo } from "../services/studentServices";
import { toast } from "sonner";

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
}) => {
  const { hapticFeedback } = useTelegram();
  const { notifications, setNotifications, notificationLoading } =
    useNotification();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const markAsRead = async (id: string) => {
    try {
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === id ? { ...notif, is_read: true } : notif
        )
      );
      await markNotificationAsRead(id);
      hapticFeedback("selection");
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      interface NotificationMap {
        [id: string]: { id: string; is_deleted: boolean };
      }

      const uns: NotificationMap = {};
      const unreadNotifications = notifications.filter((n) => !n.is_read);
      unreadNotifications.forEach((element) => {
        uns[element.id] = { id: element.id, is_deleted: false };
      });
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, is_read: true }))
      );
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          read_notifications: uns,
        };
      });
      await updateUserInfo({ ...user!, read_notifications: uns });

      hapticFeedback("impact", "light");
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const deleteNotificationHandler = async (id: string) => {
    try {
      setNotifications((prev) => prev.filter((notif) => notif.id !== id));
      let resultedReads = user?.read_notifications[id];
      if (!resultedReads) {
        resultedReads = { id: id, is_deleted: true };
      }
      resultedReads.is_deleted = true;
      await updateUserInfo({
        ...user!,
        read_notifications: {
          ...user?.read_notifications,
          [id]: resultedReads,
        },
      });
      hapticFeedback("impact", "medium");
    } catch (error) {
      toast.error("Unable to delete the notification", {
        style: {
          backgroundColor: "red",
          color: "white",
        },
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      if (!timestamp) return "Unknown time";
      const now = new Date();
      const notifTime = new Date(timestamp);
      if (isNaN(notifTime.getTime())) return "Invalid time";

      const diffInMinutes = Math.floor(
        (now.getTime() - notifTime.getTime()) / (1000 * 60)
      );

      if (diffInMinutes < 1) return "Just now";
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    } catch (error) {
      console.warn("Error formatting timestamp:", error);
      return "Unknown time";
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "contest_announcement":
        return Trophy;
      case "feedback_question":
        return MessageSquare;
      default:
        return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "contest_announcement":
        return "text-yellow-500";
      case "feedback_question":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto max-h-96">
          {notificationLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.map((notification) => {
                const IconComponent = getNotificationIcon(notification.type);
                const iconColor = getNotificationColor(notification.type);
                return (
                  <div
                    key={notification.id}
                    onClick={async () => {
                      if (notification.type === "feedback_question") {
                        try {
                          await markAsRead(notification.id);
                        } catch {}
                        onClose();
                        navigate("/feedback");
                      }
                    }}
                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                      !notification.is_read
                        ? "bg-blue-50/50 dark:bg-blue-900/10"
                        : ""
                    } ${
                      notification.type === "feedback_question"
                        ? "cursor-pointer"
                        : ""
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          !notification.is_read
                            ? "bg-blue-100 dark:bg-blue-900/20"
                            : "bg-gray-100 dark:bg-gray-700"
                        }`}
                      >
                        <IconComponent className={`w-5 h-5 ${iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4
                              className={`text-sm font-semibold ${
                                !notification.is_read
                                  ? "text-gray-900 dark:text-white"
                                  : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {notification.title}
                              {!notification.is_read && (
                                <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                              )}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                              {formatTimestamp(notification.sent_at)}
                            </p>
                          </div>

                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.is_read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                title="Mark as read"
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 mt-2">
                          {!notification.is_read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id.toString());
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Mark as read
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotificationHandler(
                                notification.id.toString()
                              );
                            }}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
