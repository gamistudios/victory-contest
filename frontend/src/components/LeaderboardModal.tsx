import { XMarkIcon } from "@heroicons/react/24/outline";
import { Award, BookOpenIcon, Medal, Trophy } from "lucide-react";
import React, { useEffect } from "react";
import { Contest, LeaderboardEntry } from "../types";
import { useTelegram } from "../hooks/useTelegram";
import { getLeaderboardByContest } from "../services/contestApi";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { PremiumUpgradeButton } from "./ContestCard";

export default function LeaderboardModal({
  selectedContest,
  setShowModal,
  isActiveContest,
}: {
  selectedContest: Contest;
  setShowModal: (show: boolean) => void;
  isActiveContest: boolean;
}) {
  const [modalLoading, setModalLoading] = React.useState(false);
  const [previousContestLeaderboard, setPreviousContestLeaderboard] =
    React.useState<LeaderboardEntry[]>([]);
  const { user } = useTelegram();
  const { user: userInfo } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setModalLoading(true);
      try {
        const leaderboard = await getLeaderboardByContest(selectedContest.id);
        setPreviousContestLeaderboard(leaderboard);
      } catch (e) {
        setPreviousContestLeaderboard([]);
      } finally {
        setModalLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  const handleEditorialClick = () => {
    if (isActiveContest) {
      toast.warning("You cannot view the editorial for an active contest.", {
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          transition: "all 0.3s ease-in-out",
        },
        duration: 3000,
      });
      return;
    }

    navigate(
      `/contest-editorial?id=${selectedContest.id}&title=${selectedContest.title}`
    );
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return (
          <div className="w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-bold text-gray-600 dark:text-gray-400">
            {rank}
          </div>
        );
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full flex flex-col max-h-[90vh]">
        {/* --- MODAL HEADER --- */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-50">
                {selectedContest.title.length > 16
                  ? selectedContest.title.slice(0, 16) + "..."
                  : selectedContest.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Final Standings
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedContest.type === "premium" && !userInfo?.is_premium ? (
                <PremiumUpgradeButton
                  onClick={() => navigate("payment")}
                  locked
                  label="Editorial"
                  loading={modalLoading}
                  className=""
                />
              ) : (
                <button
                  onClick={handleEditorialClick}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700/70 px-3 py-2 rounded-lg transition-colors"
                >
                  <BookOpenIcon className="h-5 w-5" />
                  Editorial
                </button>
              )}

              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Close"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* --- MODAL BODY / CONTENT AREA --- */}
        <div className="p-6 overflow-y-auto">
          {modalLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : previousContestLeaderboard.length > 0 ? (
            <div className="space-y-3">
              {previousContestLeaderboard.map((entry, index) => {
                const isCurrentUser = entry.user_id === user?.id.toString();

                return (
                  <div
                    key={entry.user_id}
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                      isCurrentUser
                        ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20"
                        : "bg-gray-50 dark:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      {getRankIcon(index + 1)}
                      <div>
                        <div className="flex items-center">
                          <p
                            className={`font-semibold ${
                              isCurrentUser
                                ? "text-blue-800 dark:text-blue-300"
                                : "text-gray-900 dark:text-gray-50"
                            }`}
                          >
                            {entry.user_name}
                          </p>
                          {isCurrentUser && (
                            <span className="ml-2 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {entry.correct_answers}/{entry.total_questions}{" "}
                          correct
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="font-bold text-lg text-gray-900 dark:text-gray-50">
                        {((entry.score / entry.total_questions) * 100).toFixed(
                          2
                        )}
                        %
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Rank #{index + 1}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* --- PROPER EMPTY STATE --- */
            <div className="text-center py-16">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-full w-full"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.318.239-.636.354-.961"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                No Participants Yet
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Check back later to see the final standings.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
