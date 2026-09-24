// App.tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import Dashboard from "./layout/DashboardLayout";
import Contest from "./components/contests/Contest";
import UserListPage from "./components/users/Users";
import Home from "./components/home/Home";
import ContestById from "./components/contests/ContestById";
import AddQuestions from "./components/questions/AddQuestions";
import AddContest from "./components/contests/AddContest";
import Login from "./components/auth/Login";
import RootLayout from "./components/RootLoyout";
import Register from "./components/auth/Register";
import ApproveAdmin from "./components/ApproveAdmin";
import { NotificationProvider } from "./context/NotificationContext";
import Profile from "./components/profile/Profile";
import FeedbackManagement from "./components/admin/FeedbackManagement";
import HighScorersContactList from "./components/admin/HighScorersContactList";
import { PaymentsPage } from "./components/payment/Payment";
import QuestionsPage from "./components/questions/Questions";
import ArticlesPage from "./components/articles/ArticlesPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
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
        ],
      },
      { path: "/", element: <Login /> },
      { path: "/register", element: <Register /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
