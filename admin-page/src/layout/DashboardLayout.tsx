import Sidebar from "../components/common/Sidebar.tsx";
import { Outlet, useNavigate } from "react-router-dom";

import Appbar from "../components/common/Appbar.js";
import MobileNav from "../components/common/MobileNav.tsx";
import InstallPromptBanner from "../components/common/InstallPromptBanner.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { useEffect, useState } from "react";
import { Loading } from "../components/common/Stauts.tsx";
// import AppNavbar from "./StaticComps/Appbar.jsx";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setstatus] = useState("pending");

  useEffect(() => {
    if (!user) {
      navigate("/");
    } else {
      setstatus("success");
    }
  }, [user, navigate]);
  
  if (status === "pending") {
    return (
      <div className="h-dvh w-full">
        <Loading />
      </div>
    );
  }
  
  // Don't render if no user
  if (!user) {
    return null;
  }
  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f7]">
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <Appbar mobileNav={<MobileNav />} />
        <main className="flex-1 overflow-y-auto px-4 pb-10 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <InstallPromptBanner />
      </div>
    </div>
  );
}
