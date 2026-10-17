import MyPrograms from "./pages/MyPrograms";
import AssessmentList from "./features/assessments/AssessmentList";
import Intro from "./features/assessments/Intro";
import Exam from "./features/assessments/Exam";
import Result from "./features/assessments/Result";
import AssessmentLeaderboard from "./features/assessments/AssessmentLeaderboard";
import Editorial from "./features/assessments/Editorial";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { useTelegram } from "./hooks/useTelegram";
import Layout from "./components/Layout";
import Home from "./features/home/Home";
import Leaderboard from "./features/leaderboard/LeaderboardView";
import Statistics from "./pages/Statistics";
import Profile from "./pages/Profile";
import { FeedbackPage } from "./pages/FeedBack";
import { AIPracticePage } from "./pages/AIPractice";
import RegistrationForm from "./pages/StudentRegisteration";
import Payment from "./pages/Payment";
import { UserPaymentHistoryPage } from "./pages/UserPaymentHistoryPage";
import { AuthProvider } from "./context/AuthContext";
import { PremiumSheetProvider } from "./context/PremiumSheetContext";
import ArticlesPage from "./pages/Articles";
import { ArticleView } from "./components/article/ArticleView";
import NotFound from "./components/not-found";
import { AcademyProvider } from "./features/learn/context/AcademyContext";
import { AcademyBoundary } from "./features/learn/components/AcademyBoundary";
import AcademyHome from "./features/learn/pages/Home";
import AcademyCourses from "./features/learn/pages/Courses";
import AcademySubject from "./features/learn/pages/Subject";
import AcademyModule from "./features/learn/pages/Module";
import AcademyReview from "./features/learn/pages/Review";
import AcademyProgress from "./features/learn/pages/Progress";

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

/** The legacy contest pages are gone, but old links live on in Telegram chat
 *  history and bookmarks, so they carry the contest id over to the Phase 2
 *  screen that replaced the page instead of dead-ending. */
function LegacyContestRedirect({ to }: { to?: (id: string) => string }) {
  const id = new URLSearchParams(useLocation().search).get("id");
  return <Navigate replace to={id && to ? to(encodeURIComponent(id)) : "/practice"} />;
}

function App() {
  const { isLoading } = useTelegram();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <AcademyProvider>
        <PremiumSheetProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="contest" element={<LegacyContestRedirect to={(id) => `/assessment/${id}`} />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="profile" element={<Profile />} />
            <Route path="registration" element={<LegacyContestRedirect to={(id) => `/assessment/${id}`} />} />
            <Route path="contest-editorial" element={<LegacyContestRedirect to={(id) => `/assessment/${id}/editorial`} />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="ai-practice" element={<AIPracticePage />} />
            <Route path="register" element={<RegistrationForm />} />
            <Route path="payment" element={<Payment />} />
            <Route path="programs" element={<MyPrograms />} />
            <Route path="practice" element={<AssessmentList />} />
            <Route path="assessment/:id" element={<Intro />} />
            <Route path="assessment/:id/exam" element={<Exam />} />
            <Route path="assessment/:id/leaderboard" element={<AssessmentLeaderboard />} />
            <Route path="assessment/:id/editorial" element={<Editorial />} />
            <Route path="attempt/:id/result" element={<Result />} />
            <Route
              path="payment-history"
              element={<UserPaymentHistoryPage />}
            />
            <Route element={<AcademyBoundary />}>
              <Route path="academy" element={<AcademyHome />} />
              <Route path="academy/courses" element={<AcademyCourses />} />
              <Route path="academy/subject/:id" element={<AcademySubject />} />
              <Route path="academy/module/:id" element={<AcademyModule />} />
              <Route path="academy/review" element={<AcademyReview />} />
              <Route path="academy/progress" element={<AcademyProgress />} />
            </Route>
            <Route path="article" element={<ArticlesPage />} />
            <Route path="article/:id" element={<ArticleView />} />
            <Route
              path="*"
              element={<NotFound text="The page you are looking for does not exist." />}
            />
          </Route>
        </Routes>
        </PremiumSheetProvider>
        </AcademyProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
