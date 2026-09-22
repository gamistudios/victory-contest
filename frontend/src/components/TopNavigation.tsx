import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { Bell, Settings } from "lucide-react";
import NotificationCenter from "./NotificationCenter";
import { useNotification } from "../context/NotificationContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import BotIcon from "../assets/bot-stroke-rounded.svg?react";
import FeedbackIcon from "../assets/comment-add-01-stroke-rounded.svg?react";
import UpgradeIcon from "../assets/sparkles-stroke-rounded.svg?react";
import PaymentHistoryIcon from "../assets/document-validation-stroke-rounded.svg?react";
import { useAuth } from "../context/AuthContext";
const TopNavigation: React.FC = () => {
  const { user: tgUser, hapticFeedback } = useTelegram();
  const { user } = useAuth();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications } = useNotification();
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const navigate = useNavigate();

  // useEffect(()=>{
  //   const checktgUser
  // })

  const getPageTitle = () => {
    const pathname = location.pathname;
    if (pathname === "/") {
      return "Dashboard";
    } else if (pathname === "/leaderboard") {
      return "Leaderboard";
    } else if (pathname === "/statistics") {
      return "Statistics";
    } else if (pathname === "/profile") {
      return "Profile";
    } else if (pathname === "/contest") {
      return "Contest";
    } else if (pathname === "/registration") {
      return "Registration";
    } else if (pathname === "/register") {
      return "Student Registration";
    } else if (pathname === "/contest-editorial") {
      return "Contest Editorial";
    } else if (pathname === "/ai-practice") {
      return "Ai";
    } else if (pathname === "/feedback") {
      return "Feedback";
    } else if (pathname === "/payment") {
      return "Payment";
    } else if (pathname.startsWith("/article")) {
      return "Article";
    } else {
      return "Contest App"; // This is the default case
    }
  };

  const getProfileImage = () => {
    if (tgUser?.photo_url) {
      return (
        <img
          src={tgUser.photo_url}
          alt={tgUser.first_name}
          className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-lg ring-2 ring-blue-100 dark:ring-blue-900"
        />
      );
    }

    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center border-2 border-white shadow-lg ring-2 ring-blue-100 dark:ring-blue-900">
        <span className="text-white text-sm font-bold">
          {tgUser?.first_name?.charAt(0) || "U"}
        </span>
      </div>
    );
  };

  const handleNotificationClick = () => {
    hapticFeedback("selection");
    setShowNotifications(true);
  };
  const handlePaymentsClick = () => {
    navigate("/payment-history");
  };

  const handleAiPracticeClick = () => {
    navigate("/ai-practice");
  };
  const handleUpgradeClick = () => {
    navigate("/payment");
  };

  const handleFeedbackClick = () => {
    navigate("/feedback");
  };

  return (
    <>
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getProfileImage()}
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-white">
                {getPageTitle()}
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {location.pathname.startsWith("/article")
                  ? "Read the latest articles"
                  : `Welcome back, ${tgUser?.first_name || "Student"}`}
                {tgUser?.is_premium && (
                  <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-medium rounded-full">
                    Premium
                  </span>
                )}
              </p>
            </div>
          </div>

          {location.pathname !== "/register" && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleNotificationClick}
                className="relative p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* This is your exact button, used as the trigger */}
                  <button className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:scale-105">
                    <Settings size={18} />
                  </button>
                </DropdownMenuTrigger>

                {/* The dropdown content is styled to look professional */}
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                    Advanced Options
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={!user?.is_premium}
                      onSelect={handleAiPracticeClick}
                      className="cursor-pointer"
                    >
                      <BotIcon className="mr-2 h-6 w-6 dark:text-white" />
                      <span>AI Practice</span>
                    </DropdownMenuItem>
                    {!user?.is_premium && (
                      <DropdownMenuItem
                        onSelect={handleUpgradeClick}
                        className="cursor-pointer"
                      >
                        <UpgradeIcon className="mr-2 h-6 w-6 dark:text-white text-yellow-500" />
                        <span>Upgrade</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      // disabled={true}
                      onSelect={handlePaymentsClick}
                      className="cursor-pointer"
                    >
                      <PaymentHistoryIcon className="mr-2 h-6 w-6 dark:text-white text-black" />
                      <span>Payments</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={handleFeedbackClick}
                      className="cursor-pointer"
                    >
                      <FeedbackIcon className="mr-2 h-6 w-6 dark:text-white" />
                      <span>Give Feedback</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

export default TopNavigation;
