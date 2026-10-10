import React, { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import { LeaderboardEntry } from "../types";
import { Trophy, Medal, Award, Clock, Target } from "lucide-react";
import api from "../services/api";
import { LeaderboardSkeleton } from "../components/LeaderboardSkeleton";
import NotFound from "../components/not-found";
import { safePercent } from "../lib/utils";

const avatarColors = [
  "bg-red-fix-500",
  "bg-orange-fix-500",
  "bg-amber-fix-500",
  "bg-yellow-fix-500",
  "bg-lime-fix-500",
  "bg-green-fix-500",
  "bg-emerald-fix-500",
  "bg-teal-fix-500",
  "bg-cyan-fix-500",
  "bg-sky-fix-500",
  "bg-blue-fix-500",
  "bg-indigo-fix-500",
  "bg-violet-fix-500",
  "bg-purple-fix-500",
  "bg-fuchsia-fix-500",
  "bg-pink-fix-500",
  "bg-rose-fix-500",
];

// Generates a consistent color from the list based on the user's name
const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % avatarColors.length);
  return avatarColors[index];
};

interface UserAvatarProps {
  name: string;
  avatar_url?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatar_url,
  className,
  style,
}) => {
  const initial = name?.[0]?.toUpperCase() || "?";

  if (avatar_url) {
    return (
      <img
        src={avatar_url}
        alt={name}
        className={`${className} object-cover`}
        style={style}
      />
    );
  }

  return (
    <div
      className={`${className} ${getAvatarColor(
        name
      )} flex items-center justify-center font-bold text-white`}
      style={style}
    >
      <span className="text-4xl">{initial}</span>
    </div>
  );
};

const CrownIcon: React.FC<{ color: string; className?: string }> = ({
  color,
  className,
}) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M5.16 10.3371L3 19.9998H21L18.84 10.3371C18.2324 7.60411 15.3599 5.84646 12.4223 6.13843C9.48474 6.4304 7.03793 8.35644 6.1387 10.916C5.81134 10.686 5.49477 10.5015 5.16 10.3371Z" />
    <path
      d="M12 2L14.5 6L17.5 5L17 8.5L21 9.5L19 12L21 14.5L17 14L17.5 17.5L14.5 16.5L12 19L9.5 16.5L6.5 17.5L7 14L3 14.5L5 12L3 9.5L7 8.5L6.5 5L9.5 6L12 2Z"
      fill={color}
    />
  </svg>
);

const podiumConfig = {
  1: {
    crownColor: "hsl(var(--violet-fix-200))",
    sizeClass: "w-28 h-28",
    elevationClass: "-mt-8 z-10",
    crownSize: "w-10 h-10",
  },
  2: {
    crownColor: "hsl(var(--gray-fix-300))",
    sizeClass: "w-24 h-24",
    elevationClass: "mt-4",
    crownSize: "w-8 h-8",
  },
  3: {
    crownColor: "hsl(var(--orange-fix-600))",
    sizeClass: "w-24 h-24",
    elevationClass: "mt-4",
    crownSize: "w-8 h-8",
  },
};

const PodiumItem: React.FC<{ user: LeaderboardEntry }> = ({ user }) => {
  const config = podiumConfig[user.rank as keyof typeof podiumConfig];
  return (
    <div
      className={`flex flex-col items-center gap-2 ${config.elevationClass}`}
    >
      <div className="relative">
        <UserAvatar
          name={user.user_name}
          avatar_url={user.imgurl}
          className={`${config.sizeClass} rounded-full border-4`}
          style={{ borderColor: config.crownColor }}
        />
        <CrownIcon
          color={config.crownColor}
          className={`${config.crownSize} absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2`}
        />
      </div>
      <div className="text-center">
        <p className="font-bold text-lg text-gray-900">
          {user.user_name}
        </p>

        <p className="font-bold text-xl text-gray-800 mt-1">
          {user.score}%
        </p>
      </div>
    </div>
  );
};

const Leaderboard: React.FC = () => {
  const { user } = useTelegram();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFrame, setTimeFrame] = useState<
    "today" | "week" | "month" | "all"
  >("today");
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    // Re-arm on mount: StrictMode's dev unmount/remount would otherwise
    // leave the ref false on the live pass and every fetch result discarded.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchLeaderboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(
        `/submission/leaderboard?timeFrame=${timeFrame}`
      );
      if (!isMountedRef.current) return;
      if (res.data && res.data.leaderboard) {
        setLeaderboard(res.data.leaderboard);
      } else {
        setError("Invalid leaderboard data format");
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError("Failed to fetch leaderboard data");
      console.error("Error fetching leaderboard:", err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [timeFrame]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return (
          <div className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-sm font-bold text-gray-600">
            {rank}
          </div>
        );
    }
  };

  // if (loading) {
  //   return (
  //     <div className="flex justify-center items-center h-64">
  //       <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  //     </div>
  //   );
  // }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <div className="text-lg mb-2">{error}</div>
        <button
          onClick={fetchLeaderboard}
          className="px-4 py-2 bg-blue-fix-500 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  const topThree =
    leaderboard.length >= 3 ? leaderboard.slice(0, 3) : leaderboard;

  const currentUserEntry = leaderboard.find(
    (entry) => entry.user_id.toString() === user?.id?.toString()
  );

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Time Frame Filter */}
      <div className="sticky top-0 z-30 py-4 rounded-xl bg-gray-100/80 backdrop-blur-lg">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex justify-center space-x-3 px-4 w-max mx-auto">
            {(["today", "week", "month", "all"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setTimeFrame(period)}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ease-in-out
                    ${
                      timeFrame === period
                        ? "bg-violet-fix-600 text-white shadow-md"
                        : "bg-card/60 text-gray-700 hover:bg-card"
                    }
                    hover:scale-[1.03] active:scale-[0.98]
                  `}
              >
                {period === "all" ? (
                  "All Time"
                ) : (
                  <div className="flex flex-col items-center space-y-0 leading-none">
                    {period !== "today" && (
                      <span className="text-[7px] leading-tight">This </span>
                    )}
                    {`${period.charAt(0).toUpperCase()}${period.slice(1)}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <LeaderboardSkeleton />
      ) : (
        <main className="mt-10 pb-4">
          {/* Top 3 Podium */}
          {topThree.length === 3 && (
            <div className="flex justify-center items-end gap-4 md:gap-8 mb-12 px-4">
              {/* Reorder for visual presentation: 2nd, 1st, 3rd */}
              {[topThree[1], topThree[0], topThree[2]].map((entry) => (
                <PodiumItem key={entry.user_id} user={entry} />
              ))}
            </div>
          )}

          {/* Full Leaderboard */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Full Rankings
            </h2>
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <NotFound text="No standings found" />
              ) : (
                leaderboard.map((entry) => {
                  const isCurrentUser =
                    entry.user_id.toString() === user?.id?.toString();

                  return (
                    <div
                      key={entry.user_id}
                      className={`p-4 rounded-xl shadow-sm transition-all duration-200 ${
                        isCurrentUser
                          ? "bg-violet-100 border-2 border-violet-400 shadow-lg scale-105"
                          : "bg-card/70 backdrop-blur-sm border border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getRankIcon(entry.rank)}
                          <div>
                            <div
                              className={`font-semibold ${
                                isCurrentUser
                                  ? "text-blue-800"
                                  : "text-gray-800"
                              }`}
                            >
                              {entry.user_name}
                              {isCurrentUser && (
                                <span className="ml-2 text-sm text-blue-600">
                                  (You)
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              Rank #{entry.rank}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <div className="flex items-center text-green-600">
                              <Target className="w-4 h-4 mr-1" />
                              <span className="font-bold text-gray-600">
                                {Math.round(
                                  safePercent(
                                    entry.correct_answers,
                                    entry.total_questions
                                  )
                                )}
                                %
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {entry.correct_answers}/{entry.total_questions}
                            </div>
                          </div>

                          <div className="text-center">
                            <div className="flex items-center text-blue-600">
                              <Clock className="w-4 h-4 mr-1" />
                              <span className="font-bold">
                                {entry.time_taken}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Time
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}

      {/* Your Performance Summary */}
      {user && currentUserEntry && (
        <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="font-semibold text-gray-800 mb-2">
            Your Performance
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                #{currentUserEntry.rank || "N/A"}
              </div>
              <div className="text-sm text-gray-600">
                Current Rank
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {Math.round(
                  safePercent(
                    currentUserEntry.correct_answers,
                    currentUserEntry.total_questions
                  )
                )}
                %
              </div>
              <div className="text-sm text-gray-600">
                Score
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
