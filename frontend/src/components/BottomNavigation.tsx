import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import HomeIcon from "../assets/home-09-stroke-rounded.svg?react";
import AwardIcon from "../assets/award-04-stroke-rounded.svg?react";
import AccountIcon from "../assets/account-setting-02-stroke-rounded (1).svg?react";
const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    {
      path: "/",
      icon: ({ className }: { className: string }) => {
        return <HomeIcon className={className} />;
      },
      label: "Home",
    },
    {
      path: "/leaderboard",
      icon: ({ className }: { className: string }) => {
        return <AwardIcon className={className} />;
      },
      label: "Leaderboard",
    },
    {
      path: "/statistics",
      icon: () => {
        return <BarChart3 className="mb-1 transition-all duration-200" />;
      },
      label: "Stats",
    },
    {
      path: "/profile",
      icon: ({ className }: { className: string }) => {
        return <AccountIcon className={className} />;
      },
      label: "Profile",
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-700 px-2 py-2 z-50">
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center"
            >
              <div
                className={`relative flex flex-col items-center py-1 justify-center  rounded-xl transition-all duration-200 min-w-[70px] ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    : "text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                }`}
              >
                <Icon
                  className={`${
                    isActive
                      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                      : "text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  }`}
                />
              </div>

              <span
                className={`text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    : ""
                }`}
              >
                {item.label}
              </span>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-1 w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;
