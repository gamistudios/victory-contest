import * as React from "react";
import { Drawer } from "vaul";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLinks, UserProfile } from "./Sidebar";
import Logo from "./Logo";

// Mobile navigation drawer (M3): below lg the desktop sidebar is hidden, so
// this is the only way to move between pages. Left-oriented sheet reusing the
// exact Sidebar nav content.
export default function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </Button>
      <Drawer.Root
        direction="left"
        open={open}
        onOpenChange={setOpen}
        removeScrollbar={false}
      >
        {/* Without the portal the sheet renders in normal flow inside the app
            bar, so the drawer's logo, close button and profile card spill onto
            the page instead of overlaying it. */}
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content className="fixed inset-y-0 left-0 right-auto z-50 flex h-full w-72 max-w-[85vw] flex-col rounded-none border-r bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Logo />
              <Button
                variant="ghost"
                size="icon"
                className="tight h-8 w-8"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="custom-scrollbar flex-1 overflow-y-auto px-2 py-4">
              <NavLinks isCollapsed={false} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t p-2">
              <UserProfile isCollapsed={false} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
