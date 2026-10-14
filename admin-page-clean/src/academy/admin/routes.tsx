import type { RouteObject } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import Overview from "./Overview";
import ContentTree from "./ContentTree";
import ModuleEditor from "./ModuleEditor";
import AiReview from "./AiReview";
import Analytics from "./Analytics";
import AccessPrograms from "./AccessPrograms";
import Programs from "./Programs";

/** Mounted under `/dashboard/academy` inside DashboardLayout (see App.tsx). */
export const adminRoutes: RouteObject[] = [
  {
    element: <AdminLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: "content", element: <ContentTree /> },
      { path: "module/new", element: <ModuleEditor /> },
      { path: "module/:id", element: <ModuleEditor /> },
      { path: "ai-review", element: <AiReview /> },
      { path: "analytics", element: <Analytics /> },
      { path: "access", element: <AccessPrograms /> },
      { path: "programs", element: <Programs /> },
    ],
  },
];
