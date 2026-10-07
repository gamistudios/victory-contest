// App.tsx
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import Dashboard from "./layout/DashboardLayout";
import Contest from "./components/contests/Contest";
import UserListPage from "./components/users/Users";
import Home from "./components/home/Home";
import ContestById from "./components/contests/ContestById";
import AddQuestions from "./components/questions/AddQuestions";
import AddContest from "./components/contests/AddContest";
import Login from "./components/auth/Login";
import RootLayout from "./components/RootLoyout";
import RouteError from "./components/RouteError";
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
            <Dashboard />
          </NotificationProvider>
        ),
        children: [
          { path: "", element: <Home /> },
          { path: "contest", element: <Contest /> },
          { path: "contest/:id", element: <ContestById /> },
          { path: "questions", element: <QuestionsPage /> },
          { path: "articles", element: <ArticlesPage /> },
          { path: "users", element: <UserListPage /> },
          { path: "addquestion", element: <AddQuestions /> },
          { path: "addcontest", element: <AddContest /> },
          { path: "admins", element: <ApproveAdmin /> },
          { path: "user/:id", element: <Profile /> },

          { path: "feedback", element: <FeedbackManagement /> },
          { path: "high-scorers", element: <HighScorersContactList /> },
          { path: "payment", element: <PaymentsPage /> },
          { path: "ai", element: <AiManagement /> },
          { path: "settings/payment", element: <PaymentManagementPage /> },
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
