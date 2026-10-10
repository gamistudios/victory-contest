import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { ThemeToggle } from "./ThemeToggle";
import { Bell, Settings, Lock } from "lucide-react";
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
import { getAiSettings } from "../services/aiService";
import { toast } from "sonner";
const TopNavigation: React.FC = () => {
  const { user: tgUser, hapticFeedback } = useTelegram();
  const { user } = useAuth();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications } = useNotification();
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const navigate = useNavigate();

  // AI-access switch (admin-controlled): when require_premium is on, the AI
  // Practice entry is locked for non-premium students. Read once on mount; a
  // failure to fetch is fail-open (public), matching the backend gate.
  const [aiRequirePremium, setAiRequirePremium] = useState(false);
  useEffect(() => {
    let active = true;
    getAiSettings()
      .then((s) => {
        if (active) setAiRequirePremium(!!s.require_premium);
      })
      .catch(() => {
        /* fail-open: leave AI available */
      });
    return () => {
      active = false;
    };
  }, []);
  const aiLocked = aiRequirePremium && !user?.is_premium;

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
          className="w-10 h-10 rounded-full object-cover border-2 border-card shadow-lg ring-2 ring-blue-100"
        />
      );
    }

    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-fix-500 to-purple-fix-600 flex items-center justify-center border-2 border-card shadow-lg ring-2 ring-blue-100">
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
    if (aiLocked) {
      toast.error("Buy Premium to unlock AI Practice", {
        style: {
          backgroundColor: "hsl(var(--amber-100))",
          color: "hsl(var(--amber-800))",
          border: "1px solid hsl(var(--amber-300))",
          padding: "10px",
          borderRadius: "8px",
        },
      });
      return;
    }
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
      <div className="bg-card/95 backdrop-blur-lg border-b border-border px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getProfileImage()}
            <div>
              <h1 className="text-lg font-bold text-gray-800">
                {getPageTitle()}
              </h1>
              <p className="text-xs text-gray-600">
                {location.pathname.startsWith("/article")
                  ? "Read the latest articles"
                  : `Welcome back, ${tgUser?.first_name || "Student"}`}
                {tgUser?.is_premium && (
                  <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 text-white text-xs font-medium rounded-full">
                    Premium
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="h-11 w-11" />
            {location.pathname !== "/register" && (
            <>
              <button
                onClick={handleNotificationClick}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell size={18} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-fix-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* This is your exact button, used as the trigger */}
                  <button
                    aria-label="Open menu"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Settings size={18} aria-hidden="true" />
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
                      onSelect={handleAiPracticeClick}
                      className={`cursor-pointer ${aiLocked ? "opacity-70" : ""}`}
                    >
                      {aiLocked ? (
                        <Lock className="mr-2 h-5 w-5 text-yellow-500" />
                      ) : (
                        <BotIcon className="mr-2 h-6 w-6" />
                      )}
                      <span>
                        AI Practice{aiLocked ? " (Premium)" : ""}
                      </span>
                    </DropdownMenuItem>
                    {!user?.is_premium && (
                      <DropdownMenuItem
                        onSelect={handleUpgradeClick}
                        className="cursor-pointer"
                      >
                        <UpgradeIcon className="mr-2 h-6 w-6 text-yellow-500" />
                        <span>Upgrade</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      // disabled={true}
                      onSelect={handlePaymentsClick}
                      className="cursor-pointer"
                    >
                      <PaymentHistoryIcon className="mr-2 h-6 w-6 text-foreground" />
                      <span>Payments</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={handleFeedbackClick}
                      className="cursor-pointer"
                    >
                      <FeedbackIcon className="mr-2 h-6 w-6" />
                      <span>Give Feedback</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
            )}
          </div>
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
