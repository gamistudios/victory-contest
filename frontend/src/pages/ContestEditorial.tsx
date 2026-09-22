import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  XCircle,
  Clock,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Eye,
  Brain,
  Trophy,
  Timer,
} from "lucide-react";
import { getEditorial } from "../services/contestApi";
import { useTelegram } from "../hooks/useTelegram";
import { toast } from "sonner";

// Question interface
interface Question {
  id: number;
  question_text: string;
  multiple_choice: string[];
  answer: string;
  subject: string;
  chapter: string;
  grade: string;
  difficulty?: string;
}

// EditorialQuestion interface
interface EditorialQuestion extends Question {
  explanation: string;
  user_answer?: number | null;
  is_correct?: boolean;
}

const ContestEditorial: React.FC = () => {
  const { hapticFeedback, showBackButton } = useTelegram();
  const [searchParams] = useSearchParams();
  const contestId = searchParams.get("id");
  const contestTitle = searchParams.get("title") || "Contest Editorial";

  const [questions, setQuestions] = useState<EditorialQuestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(
    new Set()
  );
  const [filter, setFilter] = useState<
    "all" | "correct" | "incorrect" | "skipped"
  >("all");
  const { user } = useTelegram();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const fetchEditorials = async () => {
      if (!user || !contestId) return;
      try {
        setLoading(true);
        const res = await getEditorial(user.id.toString(), contestId);
        if (isMounted) {
          if (!Array.isArray(res)) {
            throw new Error("Invalid editorial data.");
          }
          setQuestions(res);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch editorial.";
        if (isMounted) {
          toast.error(message, {
            style: {
              maxWidth: "400px",
              backgroundColor: "#f8d7da",
              color: "#721c24",
            },
            duration: 10000,
            position: "top-center",
            action: {
              label: "Retry",
              onClick: () => fetchEditorials(),
              actionButtonStyle: {
                backgroundColor: "#f5c6cb",
                color: "#721c24",
              },
            },
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchEditorials();
    return () => {
      isMounted = false;
    };
  }, [user, contestId]);

  const toggleQuestionExpansion = (questionId: number) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
    hapticFeedback("selection");
  };

  const getFilteredQuestions = (): EditorialQuestion[] => {
    switch (filter) {
      case "correct":
        return questions.filter(
          (q) => q.is_correct === true && q.user_answer !== -1
        );
      case "incorrect":
        return questions.filter((q) => q.is_correct === false);
      case "skipped":
        return questions.filter(
          (q) => q.user_answer === -1 || q.user_answer == null
        );
      default:
        return questions;
    }
  };

  interface AnswerStatus {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    border: string;
    text: string;
    gradient: string;
  }
  showBackButton(() => {
    navigate(-1);
  });

  const getAnswerStatus = (question: EditorialQuestion): AnswerStatus => {
    if (question.user_answer === -1 || question.user_answer == null) {
      return {
        icon: Clock,
        color: "text-amber-500",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-800",
        text: "Skipped",
        gradient: "from-amber-400 to-orange-500",
      };
    }
    if (question.is_correct && question.user_answer != -1) {
      return {
        icon: CheckCircle,
        color: "text-emerald-500",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-800",
        text: "Correct",
        gradient: "from-emerald-400 to-green-500",
      };
    }
    return {
      icon: XCircle,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-900/20",
      border: "border-rose-200 dark:border-rose-800",
      text: "Incorrect",
      gradient: "from-rose-400 to-red-500",
    };
  };

  interface PerformanceStats {
    total: number;
    correct: number;
    incorrect: number;
    skipped: number;
    accuracy: number;
  }

  const getPerformanceStats = (): PerformanceStats => {
    const total = questions.length;
    const correct = questions.filter(
      (q) => q.is_correct === true && q.user_answer != -1
    ).length;
    const incorrect = questions.filter((q) => q.is_correct === false).length;
    const skipped = questions.filter(
      (q) => q.user_answer === -1 || q.user_answer == null
    ).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, incorrect, skipped, accuracy };
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen space-y-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-800"></div>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent absolute top-0"></div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            Loading
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Preparing...
          </p>
        </div>
      </div>
    );
  }

  const stats = getPerformanceStats();
  const filteredQuestions = getFilteredQuestions();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
      <div className="p-3 max-w-full mx-auto space-y-4">
        {/* Header */}
        <div className="relative">
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 border border-white/20 dark:border-gray-700/50">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-800 dark:text-white">
                    {contestTitle}
                  </h1>
                  <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center mt-1">
                    <BookOpen className="w-3 h-3 mr-1 text-yellow-500" />
                    Editorial
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Score
                </div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {stats.accuracy}%
                </div>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <Timer className="w-5 h-5 text-blue-500" />
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800 dark:text-white">
                      {stats.total}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Total
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800">
                <div className="flex items-center justify-between">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800 dark:text-white">
                      {stats.correct}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Correct
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-100 dark:border-rose-800">
                <div className="flex items-center justify-between">
                  <XCircle className="w-5 h-5 text-rose-500" />
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800 dark:text-white">
                      {stats.incorrect}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Incorrect
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800 dark:text-white">
                      {stats.skipped}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Skipped
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex space-x-2 overflow-x-auto pb-2">
          {(["all", "correct", "incorrect", "skipped"] as const).map(
            (filterType) => {
              const count =
                filterType === "all"
                  ? stats.total
                  : filterType === "correct"
                  ? stats.correct
                  : filterType === "incorrect"
                  ? stats.incorrect
                  : stats.skipped;
              const isActive = filter === filterType;

              return (
                <button
                  key={filterType}
                  onClick={() => setFilter(filterType)}
                  className={`flex items-center px-3 py-1.5 rounded-lg font-medium text-sm capitalize ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <span className="mr-1">{filterType}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 dark:bg-gray-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            }
          )}
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.map((question, index) => {
            const isExpanded = expandedQuestions.has(question.id);
            const status = getAnswerStatus(question);
            const StatusIcon = status.icon;

            return (
              <div
                key={question.id}
                className="bg-white/90 dark:bg-gray-800/90 rounded-lg border border-white/20 dark:border-gray-700/50"
              >
                {/* Question Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`relative w-12 h-12 rounded-lg bg-gradient-to-br ${status.gradient} flex items-center justify-center`}
                      >
                        <StatusIcon className="w-6 h-6 text-white" />
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-full flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                          #{index + 1}
                        </h3>
                        <div className="flex flex-wrap items-center space-x-2 mt-1">
                          <span
                            className={`px-2 py-1 text-xs rounded-md ${status.bg} font-semibold ${status.color}`}
                          >
                            {status.text}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 mb-3">
                    <p className="text-base text-gray-800 dark:text-white">
                      {question.question_text}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="space-y-2 mb-3">
                    {question.multiple_choice.map((option, optionIndex) => {
                      const isCorrect =
                        optionIndex === Number(question.answer) - 1;
                      const isUserAnswer =
                        optionIndex + 1 === question.user_answer;

                      return (
                        <div
                          key={optionIndex}
                          className={`p-3 rounded-md border ${
                            isCorrect
                              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                              : isUserAnswer && !isCorrect
                              ? "border-rose-400 bg-rose-50 dark:bg-rose-900/30"
                              : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`w-8 h-8 rounded-full border mr-2 flex items-center justify-center text-sm font-bold ${
                                isCorrect
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : isUserAnswer && !isCorrect
                                  ? "border-rose-500 bg-rose-500 text-white"
                                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                              }`}
                            >
                              {isCorrect
                                ? "✓"
                                : isUserAnswer && !isCorrect
                                ? "✗"
                                : String.fromCharCode(65 + optionIndex)}
                            </div>
                            <span className="text-sm text-gray-800 dark:text-white flex-1">
                              {option}
                            </span>
                            {isCorrect && (
                              <div className="flex items-center">
                                <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs text-emerald-700 dark:text-emerald-300 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-md">
                                  Correct
                                </span>
                              </div>
                            )}
                            {isUserAnswer && !isCorrect && (
                              <div className="flex items-center">
                                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                <span className="text-xs text-rose-700 dark:text-rose-300 px-2 py-1 bg-rose-100 dark:bg-rose-900/30 rounded-md">
                                  Your Answer
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Toggle Button */}
                  <button
                    onClick={() => toggleQuestionExpansion(question.id)}
                    className="w-full flex items-center justify-center py-2 bg-blue-500 text-white rounded-md font-medium text-sm"
                  >
                    <div className="flex items-center space-x-2">
                      <Lightbulb className="w-4 h-4" />
                      <span>{isExpanded ? "Hide" : "Show"} Explanation</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <div className="p-4 space-y-4">
                      {/* Detailed Explanation */}
                      <div className="bg-white/80 dark:bg-gray-800/80 rounded-md p-3 border border-blue-100 dark:border-blue-800">
                        <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
                          <Brain className="w-5 h-5 text-blue-500 mr-2" />
                          Explanation
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                          {question.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredQuestions.length === 0 && (
          <div className="text-center py-8">
            <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-6 border border-white/20 dark:border-gray-700/50">
              <Eye className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-gray-800 dark:text-white">
                No Questions
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Try a different filter.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestEditorial;
