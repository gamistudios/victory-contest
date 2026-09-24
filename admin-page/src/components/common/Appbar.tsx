// src/components/layout/Header.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext"; // Assuming this context returns your Notification struct
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils"; // From shadcn/ui setup

// Shadcn/ui & Lucide Icons
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, User, Bell, BellRing, Search, Settings } from "lucide-react";

// Sub-component for the global search functionality
function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setIsOpen(false);
    command();
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-muted-foreground sm:w-64"
        onClick={() => setIsOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search anything...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100 sm:flex">
          <span className="text-lg">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem
              onSelect={() => runCommand(() => navigate("/dashboard/users"))}
            >
              Users
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCommand(() => navigate("/dashboard/questions"))
              }
            >
              Questions
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate("/dashboard/contest"))}
            >
              Contests
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markNotificationAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    // Mark as read when clicked
    if (!notification.is_read) {
      markNotificationAsRead(notification.id);
    }
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'contest_announcement':
        navigate('/dashboard/contest');
        break;
      case 'payment_notification':
        navigate('/dashboard/payment');
        break;
      case 'feedback_notification':
      case 'feedback_question':
      case 'feedback_response':
        navigate('/dashboard/feedback');
        break;
      case 'user_notification':
      case 'student_registration':
        navigate('/dashboard/users');
        break;
      case 'contest_registration':
        navigate('/dashboard/contest');
        break;
      default:
        // For unknown types, navigate to dashboard home
        navigate('/dashboard');
        break;
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    markNotificationAsRead(notificationId);
  };

  const handleDelete = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    deleteNotification(notificationId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 animate-tada" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-2" align="end">
        <DropdownMenuLabel>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary">{unreadCount} new</Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {unreadCount > 0 && (
          <>
            <div className="px-2 py-1">
              <Button
                variant="outline"
                size="sm"
                onClick={markAsRead}
                className="w-full h-8 text-xs"
              >
                Mark all as read
              </Button>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <ScrollArea className="h-96">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 cursor-pointer",
                  !notification.is_read && "bg-muted/50"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold">{notification.title}</p>
                    {notification.type && (
                      <Badge variant="outline" className="text-xs">
                        {notification.type.split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">
                    {formatDistanceToNow(new Date(notification.sent_at), {
                      addSuffix: true,
                    })}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {!notification.is_read && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleMarkAsRead(e, notification.id)}
                        className="h-6 px-2 text-xs"
                      >
                        Mark as read
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleDelete(e, notification.id)}
                      className="h-6 px-2 text-xs"
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    💡 Click to navigate to related page
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              You're all caught up!
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Sub-component for the user profile avatar and menu
function UserProfileNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (logout) logout();
    navigate("/");
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9 border">
            <AvatarImage src={user.imgurl} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email || "No email provided"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/dashboard/profile")}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Main Header component that assembles everything
export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between gap-4">
        {/* You can add a logo or sidebar toggle here if needed */}
        {/* <p className="font-bold">Dashboard</p> */}

        {/* This div pushes the right-side icons to the end */}
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <GlobalSearch />
          <NotificationBell />
          <UserProfileNav />
        </div>
      </div>
    </header>
  );
}
