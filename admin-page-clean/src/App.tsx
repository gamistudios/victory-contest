// App.tsx
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { GROUPED, LegacyRedirect } from "./app/routeGroups";

import Dashboard from "./layout/DashboardLayout";
import Contest from "./components/contests/Contest";
import UserListPage from "./components/users/Users";
import Home from "./components/home/Home";
import ContestById from "./components/contests/ContestById";
import AddQuestions from "./components/questions/AddQuestions";
import AddContest from "./components/contests/AddContest";
import AttemptsTab from "./features/assessments/AttemptsTab";
import LeaderboardsPage from "./features/leaderboards/LeaderboardsPage";
import AnalyticsPage from "./features/analytics/AnalyticsPage";
import AdminRosterPage from "./features/admins/AdminRosterPage";
import RevenueReportPage from "./features/reports/RevenueReportPage";
import QuestionBankPage from "./features/question-bank/QuestionBankPage";
import Login from "./components/auth/Login";
import RootLayout from "./components/RootLoyout";
import RouteError from "./components/RouteError";
import { ProgramProvider } from "./app/ProgramContext";
import Pricing from "./pages/Pricing";
import Locations from "./pages/Locations";
import BulkEnrolment from "./pages/BulkEnrolment";
import Register from "./components/auth/Register";
import ApproveAdmin from "./components/ApproveAdmin";
import { NotificationProvider } from "./context/NotificationContext";
import Profile from "./components/profile/Profile";
import FeedbackManagement from "./components/admin/FeedbackManagement";
import HighScorersContactList from "./components/admin/HighScorersContactList";
import AiManagement from "./components/admin/AiManagement";
import { PaymentsPage } from "./components/payment/Payment";
import { PaymentManagementPage } from "./components/settings/PaymentManagement";
import QuestionsPage from "./components/questions/Questions";
import ArticlesPage from "./components/articles/ArticlesPage";
import { adminRoutes as academyAdminRoutes } from "./features/lectures/admin/routes";

// BASE_URL is "/" in dev and "/admin/" in the single-origin production build,
// so the same route table works in both.
// BASE_URL is "/" in dev and "/admin/" in the single-origin production build,
// so the same route table works in both. Stripping the trailing slash matters:
// with basename "/admin/" a URL like "/admin" (no slash — how people type it)
// fails stripBasename, matches no route, and renders an empty page.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      errorElement: <RouteError />,
    children: [
      {
        path: "/dashboard",
        element: (
          <NotificationProvider>
            <ProgramProvider>
              <Dashboard />
            </ProgramProvider>
          </NotificationProvider>
        ),
        children: [
          { path: "", element: <Home /> },
          { path: "assessments/contest", element: <Contest /> },
          { path: "assessments/contest/:id", element: <ContestById /> },
          { path: "assessments/contest/:id/attempts", element: <AttemptsTab /> },
          { path: "bank/questions", element: <QuestionsPage /> },
          { path: "assessments/leaderboards", element: <LeaderboardsPage /> },
          { path: "bank/question-bank", element: <QuestionBankPage /> },
          { path: "engage/articles", element: <ArticlesPage /> },
          { path: "people/users", element: <UserListPage /> },
          { path: "bank/addquestion", element: <AddQuestions /> },
          { path: "assessments/addcontest", element: <AddContest /> },
          { path: "people/admins", element: <ApproveAdmin /> },
          { path: "people/admin-roles", element: <AdminRosterPage /> },
          { path: "people/user/:id", element: <Profile /> },

          { path: "insights/feedback", element: <FeedbackManagement /> },
          { path: "insights/high-scorers", element: <HighScorersContactList /> },
          { path: "insights/analytics", element: <AnalyticsPage /> },
          { path: "money/revenue", element: <RevenueReportPage /> },
          { path: "money/payment", element: <PaymentsPage /> },
          { path: "system/ai", element: <AiManagement /> },
          { path: "money/settings/payment", element: <PaymentManagementPage /> },
          { path: "programs/academy", children: academyAdminRoutes },
          { path: "money/pricing", element: <Pricing /> },
          { path: "system/locations", element: <Locations /> },
          { path: "people/enrolment", element: <BulkEnrolment /> },
          { path: "grants", element: <Navigate to="/dashboard/people/enrolment" replace /> },
          // Old flat paths keep working: redirect to the grouped route (plan 7.3).
          ...Object.keys(GROUPED).flatMap((k) => [{ path: k, element: <LegacyRedirect /> }, { path: k + "/*", element: <LegacyRedirect /> }]),
          // Without these, a mistyped URL rendered the sidebar and an empty
          // content area with nothing to explain it.
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
      { path: "/", element: <Login /> },
      { path: "/register", element: <Register /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
], { basename });

function App() {
  return <RouterProvider router={router} />;
}

export default App;
