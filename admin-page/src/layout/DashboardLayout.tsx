import Sidebar from "../components/common/Sidebar.tsx";
import { Outlet, useNavigate } from "react-router-dom";

import Appbar from "../components/common/Appbar.js";
import { useAuth } from "@/context/AuthContext.tsx";
import { useEffect, useState } from "react";
import { Loading } from "../components/common/Stauts.tsx";
// import AppNavbar from "./StaticComps/Appbar.jsx";

export default function Dashboard() {
  const navigate = useNavigate();
  const [status, setstatus] = useState("pending");
  
  // Add try-catch to handle potential useAuth errors
  let authData;
  try {
    authData = useAuth();
  } catch (error) {
    // If useAuth fails, redirect to login
    navigate("/");
    return null;
  }
  
  const { user } = authData;
  
  useEffect(() => {
    if (!user) {
      navigate("/");
    } else {
      setstatus("success");
    }
  }, [user, navigate]);
  
  if (status === "pending") {
    return (
      <div className="w-screen h-screen">
        <Loading />
      </div>
    );
  }
  
  // Don't render if no user
  if (!user) {
    return null;
  }
  return (
    <div className="flex h-screen">
      <div className="hidden custom:block w-60 border-r border-dashed border-gray-500 bg-[#faf9f7] overflow-hidden">
        <Sidebar />
      </div>
      <div className="flex-1 h-full px-6 overflow-auto bg-[#faf9f7]">
        <Appbar />
        <Outlet />
      </div>
    </div>
  );
}
