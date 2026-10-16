import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTelegram } from "../hooks/useTelegram";
import { ThemeToggle } from "./ThemeToggle";
import { Bell, Lock, SlidersHorizontal, User, BarChart3, Trophy, Layers, ChevronRight } from "lucide-react";
import { SettingsSheet } from "../academy/components/SettingsSheet";
import NotificationCenter from "./NotificationCenter";
import { useNotification } from "../context/NotificationContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import BotIcon from "../assets/bot-stroke-rounded.svg?react";
import FeedbackIcon from "../assets/comment-add-01-stroke-rounded.svg?react";
import UpgradeIcon from "../assets/sparkles-stroke-rounded.svg?react";
import PaymentHistoryIcon from "../assets/document-validation-stroke-rounded.svg?react";
import { useAuth } from "../context/AuthContext";
import { isEntitled, useEntitlements } from "@/shared/pricing/api";
import { usePremiumSheet } from "../context/PremiumSheetContext";
import { getAiSettings } from "../services/aiService";
/** One row of the account menu: tinted icon chip + label (+ optional hint). */
const MenuRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  tone?: string;
  active?: boolean;
  onSelect: () => void;
  className?: string;
}> = ({ icon, label, tone = "bg-muted text-foreground", active, onSelect, className }) => (
  <DropdownMenuItem
    onSelect={onSelect}
    className={cn("cursor-pointer gap-2.5 rounded-lg px-1.5 py-1", active && "bg-accent", className)}
  >
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>{icon}</span>
    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
  </DropdownMenuItem>
);

const TopNavigation: React.FC = () => {
  const { user: tgUser, hapticFeedback } = useTelegram();
  const { user } = useAuth();
  const { open: openPremium } = usePremiumSheet();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReading, setShowReading] = useState(false);
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
  // Same rule as the server: entitled to the PRIMARY program (any plan only for unmigrated students).
  const { data: ents } = useEntitlements();
  const primary = user?.primary_program_id;
  const hasAiAccess = primary && ents ? isEntitled(ents.byProgram[primary], ents.grace) : !!user?.is_premium;
  const aiLocked = aiRequirePremium && !hasAiAccess;

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
    } else if (pathname === "/programs") {
      return "My Programs";
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
    } else if (pathname.startsWith("/practice") || pathname.startsWith("/assessment") || pathname.startsWith("/attempt")) {
      return "Practice";
    } else if (pathname === "/ai-practice") {
      return "Ai";
    } else if (pathname === "/feedback") {
      return "Feedback";
    } else if (pathname === "/payment") {
      return "Payment";
    } else if (pathname.startsWith("/academy/courses")) {
      return "Courses";
    } else if (pathname.startsWith("/academy/review")) {
      return "Review";
    } else if (pathname.startsWith("/academy/progress")) {
      return "Progress";
    } else if (pathname.startsWith("/academy")) {
      return "Victory Academy";
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

  const menuActive = ["/leaderboard", "/statistics", "/programs", "/payment-history"].includes(location.pathname);

  const handleNotificationClick = () => {
    hapticFeedback("selection");
    setShowNotifications(true);
  };
  const handlePaymentsClick = () => {
    navigate("/payment-history");
  };

  const handleAiPracticeClick = () => {
    // A toast that says "buy premium" and goes nowhere is not a gate: the same
    // sheet the Academy locks use explains what is locked and how to pay.
    if (aiLocked) {
      hapticFeedback("impact", "light");
      openPremium("ai_practice", user?.primary_program_id);
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
                {user?.is_premium && (
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
                  <button
                    aria-label="Open account menu"
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      menuActive
                        ? "bg-blue-50 text-blue-600"
                        : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <User size={18} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent className="max-h-[calc(100vh-6rem)] w-60 overflow-y-auto rounded-2xl p-1.5" align="end" forceMount>
                  <DropdownMenuItem
                    onSelect={() => navigate("/profile")}
                    aria-label="Open profile"
                    className={cn("cursor-pointer gap-2.5 rounded-xl bg-muted/60 p-2", location.pathname === "/profile" && "bg-accent")}
                  >
                    <div className="shrink-0 [&>*]:h-9 [&>*]:w-9">{getProfileImage()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold leading-tight text-foreground">
                        {tgUser?.first_name || "Student"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user?.is_premium ? "Premium" : "Free plan"} · View profile
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </DropdownMenuItem>

                  <DropdownMenuGroup className="mt-1">
                    <MenuRow
                      icon={<Trophy className="h-4 w-4" />}
                      label="Leaderboard"
                      tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      active={location.pathname === "/leaderboard"}
                      onSelect={() => navigate("/leaderboard")}
                    />
                    <MenuRow
                      icon={<BarChart3 className="h-4 w-4" />}
                      label="Statistics"
                      tone="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                      active={location.pathname === "/statistics"}
                      onSelect={() => navigate("/statistics")}
                    />
                    <MenuRow
                      icon={<Layers className="h-4 w-4" />}
                      label="My programs"
                      tone="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                      active={location.pathname === "/programs"}
                      onSelect={() => navigate("/programs")}
                    />
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuGroup>
                    <MenuRow
                      icon={aiLocked ? <Lock className="h-4 w-4" /> : <BotIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />}
                      label={`AI Practice${aiLocked ? " (Premium)" : ""}`}
                      tone={aiLocked ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" : "bg-emerald-100 dark:bg-emerald-950"}
                      onSelect={handleAiPracticeClick}
                      className={aiLocked ? "opacity-80" : ""}
                    />
                    {!user?.is_premium && (
                      <MenuRow
                        icon={<UpgradeIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />}
                        label="Upgrade"
                        tone="bg-yellow-100 dark:bg-yellow-950"
                        onSelect={handleUpgradeClick}
                      />
                    )}
                    <MenuRow
                      icon={<SlidersHorizontal className="h-4 w-4" />}
                      label="Learning settings"
                      tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      onSelect={() => setShowReading(true)}
                    />
                    <MenuRow
                      icon={<PaymentHistoryIcon className="h-5 w-5 text-sky-600 dark:text-sky-300" />}
                      label="Payments"
                      tone="bg-sky-100 dark:bg-sky-950"
                      onSelect={handlePaymentsClick}
                    />
                    <MenuRow
                      icon={<FeedbackIcon className="h-5 w-5 text-pink-600 dark:text-pink-300" />}
                      label="Give feedback"
                      tone="bg-pink-100 dark:bg-pink-950"
                      onSelect={handleFeedbackClick}
                    />
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
            )}
          </div>
        </div>
      </div>

      <SettingsSheet open={showReading} onOpenChange={setShowReading} />
      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

export default TopNavigation;
