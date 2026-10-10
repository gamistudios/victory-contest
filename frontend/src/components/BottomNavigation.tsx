import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import HomeIcon from "../assets/home-09-stroke-rounded.svg?react";
import AwardIcon from "../assets/award-04-stroke-rounded.svg?react";
import AccountIcon from "../assets/account-setting-02-stroke-rounded (1).svg?react";
const BottomNavigation: React.FC = () => {
  const location = useLocation();

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
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-gray-200 px-2 py-2 z-50"
    >
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center"
            >
              <div
                className={`relative flex flex-col items-center py-1 justify-center  rounded-xl transition-all duration-200 min-w-[70px] ${
                  isActive
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                }`}
              >
                <Icon
                  className={`${
                    isActive
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                  }`}
                />
              </div>

              <span
                className={`text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "font-semibold text-blue-600 bg-blue-50"
                    : ""
                }`}
              >
                {item.label}
              </span>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-1 w-1 h-1 bg-blue-fix-600 rounded-full"></div>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
