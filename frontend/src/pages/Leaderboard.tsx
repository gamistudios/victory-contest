import React, { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import { LeaderboardEntry } from "../types";
import { Trophy, Medal, Award, Clock, Target } from "lucide-react";
import api from "../services/api";
import { LeaderboardSkeleton } from "../components/LeaderboardSkeleton";
import { EmptyState, InlineError } from "@/academy/components/States";
import { safePercent, cn } from "../lib/utils";

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

const rankChip = (rank: number) =>
  rank === 1
    ? "bg-yellow-100 text-yellow-800"
    : rank === 2
      ? "bg-gray-200 text-gray-700"
      : rank === 3
        ? "bg-amber-100 text-amber-800"
        : "bg-muted text-muted-foreground";

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => (
  <span
    className={cn(
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold",
      rankChip(rank)
    )}
  >
    {rank === 1 ? (
      <Trophy className="h-5 w-5" />
    ) : rank === 2 ? (
      <Medal className="h-5 w-5" />
    ) : rank === 3 ? (
      <Award className="h-5 w-5" />
    ) : (
      rank
    )}
  </span>
);

const ListAvatar: React.FC<{ name: string; avatar_url?: string | null }> = ({
  name,
  avatar_url,
}) =>
  avatar_url ? (
    <img
      src={avatar_url}
      alt={name}
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
      {(name || "S").slice(0, 1).toUpperCase()}
    </span>
  );

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
        className={cn(className, "object-cover")}
        style={style}
      />
    );
  }

  return (
    <div
      className={cn(
        className,
        getAvatarColor(name),
        "flex items-center justify-center font-bold text-white"
      )}
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
        <p className="truncate font-nunito text-base font-extrabold text-foreground">
          {user.user_name}
        </p>

        <p className="mt-0.5 text-sm font-bold text-muted-foreground">
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

  if (error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
        <InlineError message={error} onRetry={fetchLeaderboard} />
      </div>
    );
  }

  const topThree =
    leaderboard.length >= 3 ? leaderboard.slice(0, 3) : leaderboard;

  const currentUserEntry = leaderboard.find(
    (entry) => entry.user_id.toString() === user?.id?.toString()
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-foreground">
          Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Global standings for the selected period.
        </p>
      </div>

      {/* Time Frame Filter */}
      <div className="sticky top-0 z-30 rounded-2xl border border-border bg-background/80 p-2 backdrop-blur-lg">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="mx-auto flex w-max justify-center gap-2">
            {(["today", "week", "month", "all"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setTimeFrame(period)}
                className={cn(
                  "flex h-9 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-all duration-200 ease-in-out",
                  timeFrame === period
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                  "active:scale-[0.98]"
                )}
              >
                {period === "all" ? (
                  "All Time"
                ) : (
                  <div className="flex flex-col items-center leading-none">
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
        <main className="flex flex-col gap-3">
          {/* Top 3 Podium */}
          {topThree.length === 3 && (
            <div className="flex items-end justify-center gap-4 px-4 pt-6 md:gap-8">
              {/* Reorder for visual presentation: 2nd, 1st, 3rd */}
              {[topThree[1], topThree[0], topThree[2]].map((entry) => (
                <PodiumItem key={entry.user_id} user={entry} />
              ))}
            </div>
          )}

          {/* Full Leaderboard */}
          <div>
            <h2 className="font-nunito text-base font-extrabold text-foreground">
              Full Rankings
            </h2>
            <div className="flex flex-col gap-2">
              {leaderboard.length === 0 ? (
                <EmptyState
                  icon={<Trophy className="h-6 w-6" />}
                  title="No standings found"
                />
              ) : (
                leaderboard.map((entry) => {
                  const isCurrentUser =
                    entry.user_id.toString() === user?.id?.toString();

                  return (
                    <div
                      key={entry.user_id}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border p-3",
                        isCurrentUser
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card"
                      )}
                    >
                      <RankBadge rank={entry.rank} />
                      <ListAvatar
                        name={entry.user_name}
                        avatar_url={entry.imgurl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">
                          {entry.user_name}
                          {isCurrentUser && (
                            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                              (You)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Rank #{entry.rank}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Target className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-extrabold text-foreground">
                              {Math.round(
                                safePercent(
                                  entry.correct_answers,
                                  entry.total_questions
                                )
                              )}
                              %
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.correct_answers}/{entry.total_questions}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold text-foreground">
                              {entry.time_taken}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Time
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
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-nunito text-base font-extrabold text-foreground">
            Your Performance
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-extrabold text-foreground">
                #{currentUserEntry.rank || "N/A"}
              </div>
              <div className="text-xs text-muted-foreground">
                Current Rank
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-extrabold text-foreground">
                {Math.round(
                  safePercent(
                    currentUserEntry.correct_answers,
                    currentUserEntry.total_questions
                  )
                )}
                %
              </div>
              <div className="text-xs text-muted-foreground">
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
