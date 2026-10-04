// src/components/layout/Sidebar.tsx
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import Logo from "./Logo";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
// src/components/layout/UserProfile.tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { menuList, NavGroup } from "./Sidentmenu";
import { useAuth } from "@/context/AuthContext";

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r bg-background p-4 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "overflow-hidden transition-all",
            isCollapsed ? "w-0" : "w-full",
          )}
        >
          <Logo />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="tight absolute right-0 top-8 h-8 w-8 translate-x-1/2 rounded-full border bg-background text-foreground hover:bg-muted"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      <div
        className="flex-1 overflow-y-auto pt-8
  /* Base scrollbar track and width */
  [&::-webkit-scrollbar]:w-1
  [&::-webkit-scrollbar-track]:bg-gray-100
  dark:[&::-webkit-scrollbar-track]:bg-neutral-700
  
  /* The draggable scrollbar thumb */
  [&::-webkit-scrollbar-thumb]:bg-gray-400
  dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500

  /* NEW: Add these classes to make the thumb look shorter */
  [&::-webkit-scrollbar-thumb]:rounded-full
  [&::-webkit-scrollbar-thumb]:border-2
  [&::-webkit-scrollbar-thumb]:border-solid
  [&::-webkit-scrollbar-thumb]:border-gray-100
  dark:[&::-webkit-scrollbar-thumb]:border-neutral-700"
      >
        <NavLinks isCollapsed={isCollapsed} />
      </div>

      <div className="mt-auto">
        <UserProfile isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}

interface NavLinksProps {
  isCollapsed: boolean;
  onNavigate?: () => void;
}

export function NavLinks({ isCollapsed, onNavigate }: NavLinksProps) {
  const location = useLocation();

  // The provider lives here rather than in each host: the mobile drawer
  // (MobileNav) renders this same list and Radix's Tooltip.Trigger throws
  // without one, which took down the whole app when the drawer opened.
  return (
    <TooltipProvider delayDuration={0}>
      <nav className="flex flex-col gap-2">
        {menuList.map((group: NavGroup, groupIndex: number) => (
          <div key={groupIndex} className="space-y-2">
            {!isCollapsed && (
              <h2 className="px-4 pt-4 text-xs font-semibold uppercase text-muted-foreground">
                {group.title}
              </h2>
            )}
            {isCollapsed && groupIndex > 0 && <Separator />}
            {group.items.map((item) => {
              const isActive = location.pathname === item.path;

              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      className={`flex rounded-md py-4 mb-2 cursor-pointer items-center px-4 text-sm outline-none transition-all duration-100 ease-in-out hover:border-l-4 hover:border-[#00AB55] hover:text-[#00AB55] ${
                        isActive
                          ? "border-l-4 bg-[#00AB5514] border-l-[#00AB55] text-[#00AB55] font-bold"
                          : "border-l-0 text-gray-600 font-medium"
                      }`}
                    >
                      <span
                        className={cn(
                          "h-5 w-5 flex-shrink-0",
                          isCollapsed ? "" : "mr-2",
                        )}
                      >
                        {React.createElement(item.icon, {
                          className: "h-5 w-5",
                        })}
                      </span>
                      <span
                        className={cn("truncate", isCollapsed && "sr-only")}
                      >
                        {item.title}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" sideOffset={5}>
                      {item.title}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

interface UserProfileProps {
  isCollapsed: boolean;
}

export function UserProfile({ isCollapsed }: UserProfileProps) {
  const { user } = useAuth();

  if (!user) {
    return (
      <Card
        className={cn(
          "cursor-pointer border-none bg-muted/50 transition-colors hover:bg-muted/80",
          isCollapsed ? "p-0" : "p-2",
        )}
      >
        <CardHeader className="flex flex-row items-center gap-3 p-2">
          <Avatar>
            <AvatarFallback>...</AvatarFallback>
          </Avatar>
          <div className={cn("truncate", isCollapsed ? "hidden" : "block")}>
            <CardTitle className="text-sm font-semibold capitalize">
              Loading...
            </CardTitle>
            <CardDescription className="text-xs">Please wait</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer border-none bg-muted/50 transition-colors hover:bg-muted/80",
        isCollapsed ? "p-0" : "p-2",
      )}
    >
      <CardHeader className="flex flex-row items-center gap-3 p-2">
        <Avatar>
          <AvatarImage src={user.imgurl} alt={user.name} />
          <AvatarFallback>{user.name?.charAt(0) || "U"}</AvatarFallback>
        </Avatar>
        <div className={cn("truncate", isCollapsed ? "hidden" : "block")}>
          <CardTitle className="text-sm font-semibold capitalize">
            {user.name || "User"}
          </CardTitle>
          <CardDescription className="text-xs">
            {user.email || "No email"}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
