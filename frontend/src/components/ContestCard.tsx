import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Contest } from "../types";
import {
  BarChart3,
  CheckCircle,
  ChevronRight,
  Crown,
  Lock,
  Play,
  PlayCircle,
  Star,
  Timer,
  XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { isUserRegistered } from "../services/contestApi";
import { useContestTimer, ContestStatus } from "../hooks/useContestTimer";
import LeaderboardModal from "./LeaderboardModal";
import { formatDistanceStrict } from "date-fns";
import { useAuth } from "../context/AuthContext";

const ExpandableDescription = ({ text }: { text: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (element) {
      if (element.scrollHeight > element.clientHeight) {
        setIsOverflowing(true);
      }
    }
  }, [text]);

  return (
    <div className="mb-4">
      <p
        ref={textRef}
        className={`text-sm text-gray-600 dark:text-gray-400 leading-relaxed ${
          !isExpanded ? "line-clamp-1" : ""
        }`}
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 dark:text-blue-400 text-xs font-semibold mt-1 hover:underline focus:outline-none"
        >
          {isExpanded ? "Show Less" : "Show More"}
        </button>
      )}
    </div>
  );
};

export default function ContestCard({ contest }: { contest: Contest }) {
  const { timeLeft, status } = useContestTimer(
    contest.start_time,
    contest.end_time
  );
  const { user: userInfo } = useAuth();

  const { hapticFeedback, user } = useTelegram();
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [checkingRegistration, setCheckingRegistration] =
    useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    const checkRegistration = async () => {
      if (user && contest.id) {
        setCheckingRegistration(true);
        try {
          const registered = await isUserRegistered(
            contest.id,
            user.id.toString()
          );
          if (!ignore) setIsRegistered(registered);
        } catch (e) {
          if (!ignore) setIsRegistered(false);
        } finally {
          if (!ignore) setCheckingRegistration(false);
        }
      } else {
        setIsRegistered(false);
        setCheckingRegistration(false);
      }
    };
    checkRegistration();
    return () => {
      ignore = true;
    };
  }, [contest.id, user?.id]);

  const handleContestClick = () => {
    hapticFeedback("impact", "light");
  };
  const handleCurrentStandingsClick = () => {
    hapticFeedback("impact", "light");
    setShowModal(true);
  };

  const canJoin = status === "ACTIVE" && isRegistered;
  const isPendingStart = status === "UPCOMING" && isRegistered;
  const canRegister =
    (status === "UPCOMING" || status === "ACTIVE") && !isRegistered;
  const isEnded = status === "ENDED";

  const getTimerLabel = (status: ContestStatus) => {
    switch (status) {
      case "UPCOMING":
        return "Starts in";
      case "ACTIVE":
        return "Ends in";
      case "ENDED":
        return "Status";
      case "LOADING":
      default:
        return "Status";
    }
  };

  return (
    <div
      key={contest.id}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden  first-letter:bg-white active:bg-gray-50 transition-color"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center justify-between space-x-2 mb-2">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {contest.title}
              </h3>
              {contest.type === "free" ? (
                <div className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-200">
                  <CheckCircle className="mr-1.5 h-4 w-4 fill-current text-green-600 dark:text-green-400" />
                  Free
                </div>
              ) : (
                <div className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">
                  <Star className="mr-1.5 h-4 w-4 fill-current text-yellow-600 dark:text-yellow-400" />
                  Premium
                </div>
              )}
            </div>
            <ExpandableDescription text={contest.description} />
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 mb-4 border border-blue-100 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Timer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {getTimerLabel(status)}
              </span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {timeLeft}
              </div>
              <div className="text-xs text-blue-500 dark:text-blue-400">
                {(() => {
                  try {
                    if (!contest.start_time) return "No date";
                    const date = new Date(contest.start_time);
                    if (isNaN(date.getTime())) return "Invalid date";
                    return date.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  } catch (error) {
                    console.warn("Error formatting start_time date:", error);
                    return "Invalid date";
                  }
                })()}
              </div>
            </div>
          </div>
        </div>

        <div className="">
          {contest.type === "premium" && !userInfo?.is_premium ? (
            <PremiumUpgradeButton
              onClick={() => navigate("/payment")}
              fullWidth={true}
              priceHint="200/mo"
            />
          ) : (
            <div className="flex flex-col items-center">
              <Link
                state={{
                  contestData: {
                    id: contest.id,
                    title: contest.title,
                    startTime: contest.start_time,
                    questions: contest.questions.length,
                    duration: formatDistanceStrict(
                      new Date(contest.end_time),
                      new Date(contest.start_time),
                      { unit: "minute" }
                    ),

                    prizes: contest.prize,
                  },
                }}
                to={
                  canJoin
                    ? `/contest?con=${contest.id}`
                    : canRegister
                    ? `/registration?con=${contest.id}`
                    : "#"
                }
                onClick={handleContestClick}
                className={`w-full flex items-center justify-center px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] ${
                  canJoin
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                    : isPendingStart
                    ? "bg-green-500 text-white cursor-not-allowed"
                    : canRegister
                    ? "bg-blue-500 text-white"
                    : isEnded
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-blue-500 text-white" // Fallback for loading state
                }`}
                aria-disabled={
                  isPendingStart || isEnded || checkingRegistration
                }
                tabIndex={
                  isPendingStart || isEnded || checkingRegistration
                    ? -1
                    : undefined
                }
                style={{
                  pointerEvents:
                    isPendingStart || isEnded || checkingRegistration
                      ? "none"
                      : "auto",
                }}
              >
                {checkingRegistration ? (
                  <>
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
                    Checking...
                  </>
                ) : canJoin ? (
                  <>
                    <PlayCircle className="w-5 h-5 mr-2" />
                    Join Contest Now
                  </>
                ) : isPendingStart ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Registered
                  </>
                ) : canRegister ? (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Register Now
                  </>
                ) : isEnded ? (
                  <>
                    <XCircle className="w-5 h-5 mr-2" />
                    Contest Ended
                  </>
                ) : (
                  "Register"
                )}
                {!checkingRegistration && (
                  <ChevronRight className="w-4 h-4 ml-2" />
                )}
              </Link>
              {status === "ACTIVE" && (
                <Link
                  to="#"
                  onClick={handleCurrentStandingsClick}
                  className="mt-4 flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Current Standings
                </Link>
              )}
            </div>
          )}
        </div>
        {showModal && (
          <LeaderboardModal
            selectedContest={contest}
            setShowModal={setShowModal}
            isActiveContest={true}
          />
        )}
      </div>
    </div>
  );
}

type PremiumUpgradeButtonProps = {
  onClick?: () => void;
  locked?: boolean; // show lock icon + disabled feel
  loading?: boolean;
  fullWidth?: boolean;
  label?: string;
  className?: string;
  priceHint?: string; // e.g. "7-day free trial"
};

export function PremiumUpgradeButton({
  onClick,
  locked = true,
  loading = false,
  fullWidth = false,
  label = "Upgrade to Premium",
  className = "",
  priceHint,
}: PremiumUpgradeButtonProps) {
  const isDisabled = loading;

  return (
    <button
      onClick={onClick}
      aria-disabled={isDisabled}
      className={[
        "group flex items-center justify-center gap-2 rounded-2xl px-4 py-2",
        "text-sm font-semibold shadow-sm transition-all",
        "bg-gradient-to-r from-amber-500 to-amber-600 text-white",
        "hover:from-amber-600 hover:to-amber-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500",
        "disabled:opacity-70 disabled:cursor-not-allowed",
        locked ? "relative" : "",
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      disabled={isDisabled}
    >
      {/* Left icon stack */}
      <span className="">
        <Lock className="h-4 w-4 opacity-90 drop-shadow" aria-hidden="true" />
      </span>

      <span>{loading ? "Processing…" : label}</span>

      {/* Right pill hint */}
      {priceHint && !loading && (
        <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
          {priceHint}
        </span>
      )}
    </button>
  );
}
