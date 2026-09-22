import React, { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import { Contest } from "../types";
import { Calendar } from "lucide-react";
import { getAllContests } from "../services/contestApi";
import ContestCard, { PremiumUpgradeButton } from "../components/ContestCard";
import NoContests from "../components/NoContest";
import { Link, useNavigate } from "react-router-dom";
import { ContestCardSkeleton } from "../components/ContestCardSkeleton";
import WelcomeCarousel from "../components/WelcomeCarousell";
import LeaderboardModal from "../components/LeaderboardModal";
import {
  safeFormatDistanceToNow,
  safeParseDate,
  safeQuestionsLength,
} from "../lib/utils";
import { ArticleListForHome } from "../components/article/ArticleList";
import { useAuth } from "../context/AuthContext";
import ErrorMessage from "../components/ErrorComponent";

const Home: React.FC = () => {
  const { user, hapticFeedback, hideBackButton } = useTelegram();
  const { user: userInfo } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [previousContests, setPreviousContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPreviousContest, setSelectedPreviousContest] =
    useState<Contest | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(true);
  const [contestError, setContestError] = useState<string | null>(null);

  const [showPreviousModal, setShowPreviousModal] = useState(false);
  const navigate = useNavigate();
  hideBackButton();
  useEffect(() => {
    const fetchContests = async () => {
      setLoading(true);
      setContestError(null);
      try {
        const contests = await getAllContests();
        // Split contests into active and previous based on end_time
        const now = new Date();
        const active: Contest[] = [];
        const previous: Contest[] = [];
        contests.forEach((contest) => {
          try {
            const endTime = contest.end_time
              ? new Date(contest.end_time)
              : null;
            if (endTime && !isNaN(endTime.getTime()) && endTime > now) {
              active.push(contest);
            } else {
              previous.push(contest);
            }
          } catch (error) {
            previous.push(contest);
          }
        });
        setContests(active);
        setPreviousContests(previous);
      } catch (e) {
        // handle error
        setContestError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, [triggerLoading]);

  const handleShowStandings = async (contest: Contest) => {
    hapticFeedback("selection");
    setSelectedPreviousContest(contest);
    setShowPreviousModal(true);
  };

  const filteredContest = React.useMemo(() => {
    if (loading) return [];
    return contests.filter((con) => con.grade === userInfo?.grade);
  }, [loading, contests, userInfo]);

  return (
    <div className="p-4 space-y-6">
      {/* Welcome Section */}
      <WelcomeCarousel user={user} />
      {/* Read Articles Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-nunito-sans text-gray-700 dark:text-white">
            Read Articles
          </h2>
        </div>
        <ArticleListForHome />
      </div>
      {/* Upcoming Contests */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-nunito-sans text-gray-700 dark:text-white">
            Upcoming Contests
          </h2>
          <div className="flex items-center text-blue-600 dark:text-blue-400">
            <Calendar className="w-4 h-4 mr-1" />
            <span className="text-sm font-medium">
              {contests.length} Available
            </span>
          </div>
        </div>

        {loading ? (
          <ContestCardSkeleton />
        ) : contestError !== null ? (
          <ErrorMessage
            message="Something Went wrong. please try again!"
            onRetry={() => setTriggerLoading((prev) => !prev)}
          />
        ) : (
          <div className="space-y-4">
            {filteredContest.map((contest) => {
              return <ContestCard contest={contest} key={contest.id} />;
            })}
          </div>
        )}
        {filteredContest.length === 0 && contestError == null && (
          <NoContests type="active" />
        )}
      </div>

      {/* Previous Contests */}
      <div>
        <h2 className="text-lg font-bold mb-4 font-nunito text-gray-700 dark:text-white">
          Previous Contests
        </h2>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : contestError !== null ? (
          <ErrorMessage
            message="Unable to load the previous contests. please try again!"
            onRetry={() => setTriggerLoading((prev) => !prev)}
          />
        ) : (
          <div className="space-y-3">
            {previousContests
              .sort((a, b) => {
                try {
                  const aTime = safeParseDate(
                    a.start_time,
                    new Date(0)
                  ).getTime();
                  const bTime = safeParseDate(
                    b.start_time,
                    new Date(0)
                  ).getTime();
                  return bTime - aTime;
                } catch (error) {
                  console.warn("Error sorting contests by date:", error);
                  return 0;
                }
              })
              .map((contest) => (
                <div
                  onClick={() => handleShowStandings(contest)}
                  key={contest.id}
                  className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-1">
                        {contest.title}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>
                          {safeFormatDistanceToNow(
                            contest.start_time,
                            "No start time"
                          )}{" "}
                          ago
                        </span>
                        <span>•</span>
                        <span>
                          {safeQuestionsLength(contest.questions)} questions
                        </span>
                      </div>
                    </div>

                    {contest.type === "premium" && !user?.is_premium ? (
                      <PremiumUpgradeButton
                        onClick={() => navigate("payment")}
                        locked
                        label="Pro"
                        loading={false}
                        className="p-2"
                      />
                    ) : (
                      <Link
                        to={`/contest-editorial?id=${contest.id}&title=${contest.title}`}
                        className={`flex rounded-full cursor-pointer items-center justify-center w-10 h-10 text-sm hover:text-[#00AB55] hover:bg-[#00AB5514] text-[#00AB55] font-bold`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          role="img"
                          className="h-5 w-5 "
                          width="1.5em"
                          height="1.5em"
                          preserveAspectRatio="xMidYMid meet"
                          viewBox="0 0 256 256"
                        >
                          <g fill="currentColor">
                            <path
                              d="M152 128a24 24 0 1 1-24-24a24 24 0 0 1 24 24"
                              opacity=".2"
                            ></path>
                            <path d="M200 152a31.84 31.84 0 0 0-19.53 6.68l-23.11-18A31.65 31.65 0 0 0 160 128c0-.74 0-1.48-.08-2.21l13.23-4.41A32 32 0 1 0 168 104c0 .74 0 1.48.08 2.21l-13.23 4.41A32 32 0 0 0 128 96a32.6 32.6 0 0 0-5.27.44L115.89 81A32 32 0 1 0 96 88a32.6 32.6 0 0 0 5.27-.44l6.84 15.4a31.92 31.92 0 0 0-8.57 39.64l-25.71 22.84a32.06 32.06 0 1 0 10.63 12l25.71-22.84a31.91 31.91 0 0 0 37.36-1.24l23.11 18A31.65 31.65 0 0 0 168 184a32 32 0 1 0 32-32m0-64a16 16 0 1 1-16 16a16 16 0 0 1 16-16M80 56a16 16 0 1 1 16 16a16 16 0 0 1-16-16M56 208a16 16 0 1 1 16-16a16 16 0 0 1-16 16m56-80a16 16 0 1 1 16 16a16 16 0 0 1-16-16m88 72a16 16 0 1 1 16-16a16 16 0 0 1-16 16"></path>
                          </g>
                        </svg>
                      </Link>
                    )}
                    <Link
                      onClick={() => {
                        handleShowStandings(contest);
                      }}
                      to=""
                      className={`flex rounded-full cursor-pointer items-center justify-center w-10 h-10 text-sm hover:text-[#00AB55] hover:bg-[#00AB5514] text-[#00AB55] font-bold`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                        role="img"
                        width="0.8em"
                        height="0.8em"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5 "
                      >
                        <g fill="none">
                          <path
                            fill="currentColor"
                            d="M4 4.001h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
                            opacity=".16"
                          ></path>
                          <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M11 4H4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M9 15L20 4m-5 0h5v5"
                          ></path>
                        </g>
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Previous Contest Modal */}
      {showPreviousModal && selectedPreviousContest && (
        <LeaderboardModal
          selectedContest={selectedPreviousContest}
          setShowModal={setShowPreviousModal}
          isActiveContest={false}
        />
      )}
    </div>
  );
};

export default Home;
