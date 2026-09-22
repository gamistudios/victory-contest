import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import QuestionNavigationDropdown from "../components/QuestionNavigationDropdown";
import { ContestAnswer, Contest } from "../types";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import { getContestById } from "../services/contestApi";
import { toast } from "sonner";
import api from "../services/api";
import { submitContestResult } from "../services/contestApi";
import { Button } from "../components/ui/button";
import axios from "axios";

const ContestComponent: React.FC = () => {
  const { hapticFeedback, hideMainButton, showConfirm } = useTelegram();
  const navigate = useNavigate();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<ContestAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(0); // Will be set after contest is loaded
  const [loading, setLoading] = useState(true);
  const [error, _] = useState<string | null>(null);

  const [contestEnded, setContestEnded] = useState(false);
  const [searchParams] = useSearchParams();
  const conId = useMemo(() => searchParams.get("con"), [searchParams]);
  const [contest, setContest] = useState({} as Contest);
  const questions = useMemo(() => contest?.questions || [], [contest]);
  const currentQuestion = useMemo(
    () => questions[currentQuestionIndex],
    [questions, currentQuestionIndex]
  );
  const progress = useMemo(
    () => (answers.length / (questions.length || 1)) * 100,
    [answers, questions]
  );
  const [submitting, setSubmitting] = useState(false);
  const { user } = useTelegram();
  const [isImageModalOpen, setIsImageModalOpen] = useState(false); // State for the image modal

  useEffect(() => {
    if (timeLeft > 0 && !contestEnded) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (
      timeLeft === 0 &&
      Object.keys(contest).length > 0 &&
      !contestEnded
    ) {
      handleContestEnd();
    }
  }, [timeLeft, contestEnded]);

  useEffect(() => {
    if (!conId || !user?.id) {
      // setLoading(false);
      return;
    }

    const fetchAndSetupContest = async () => {
      try {
        // Check if user is already active in the contest
        await api.get(`/contest-registration/isActive/${conId}/${user?.id}`);

        const contestData = await getContestById(conId);
        setContest(contestData);

        let endTime: number;
        try {
          if (!contestData.end_time) {
            endTime = Date.now();
          } else {
            const endTimeDate = new Date(contestData.end_time);
            if (isNaN(endTimeDate.getTime())) {
              endTime = Date.now();
            } else {
              endTime = endTimeDate.getTime();
            }
          }
        } catch (error) {
          console.warn("Error parsing end_time:", error);
          endTime = Date.now();
        }

        const now = Date.now();
        const diffInSeconds = Math.floor((endTime - now) / 1000);
        setTimeLeft(diffInSeconds > 0 ? diffInSeconds : 0);
      } catch (err: any) {
        let apiError: string;
        if (axios.isAxiosError(err)) {
          apiError =
            (typeof err.response?.data === "string"
              ? err.response.data
              : err.response?.data?.error ||
                err.response?.data?.message ||
                err.response?.data?.detail) || err.message;
        } else {
          apiError = err?.message || "An unexpected error occurred.";
        }

        toast.error(apiError, {
          description: "Please try again later or contact support.",
          style: {
            backgroundColor: "red",
            color: "white",
          },
          position: "top-center",
        });
        // Optional: navigate away on critical error
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchAndSetupContest();
  }, [user]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswer(answerIndex + 1);
    hapticFeedback("selection");
  };
  // Add this function inside your ContestComponent
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // Restore the previously selected answer for that question
      const targetQuestion = questions[currentQuestionIndex - 1];
      const existingAnswer = answers.find(
        (a) => a.question.id === targetQuestion.id
      );
      setSelectedAnswer(existingAnswer ? existingAnswer.selected_answer : null);
      hapticFeedback("impact", "light");
    }
  };

  const handleNextQuestion = () => {
    if (selectedAnswer === null) {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedAnswer(null);
      } else {
        endContest();
      }
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === Number(currentQuestion.answer);

    const newAnswer: ContestAnswer = {
      question: currentQuestion,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      time_taken: 60,
    };

    const updatedAnswers = [...answers];
    const existingAnswerIndex = updatedAnswers.findIndex(
      (a) => a.question.id === currentQuestion.id
    );

    if (existingAnswerIndex >= 0) {
      updatedAnswers[existingAnswerIndex] = newAnswer;
    } else {
      updatedAnswers.push(newAnswer);
    }

    setAnswers(updatedAnswers);
    hapticFeedback("impact", "light");

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
    } else {
      endContest();
    }
  };

  const handleQuestionSelect = (questionIndex: number) => {
    // Save current answer if one is selected
    if (selectedAnswer !== null) {
      const currentQuestion = questions[currentQuestionIndex];
      const isCorrect = selectedAnswer === Number(currentQuestion.answer);

      const newAnswer: ContestAnswer = {
        question: currentQuestion,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        time_taken: 60,
      };

      const updatedAnswers = [...answers];
      const existingAnswerIndex = updatedAnswers.findIndex(
        (a) => a.question.id === currentQuestion.id
      );

      if (existingAnswerIndex >= 0) {
        updatedAnswers[existingAnswerIndex] = newAnswer;
      } else {
        updatedAnswers.push(newAnswer);
      }

      setAnswers(updatedAnswers);
    }

    // Navigate to selected question
    setCurrentQuestionIndex(questionIndex);

    const targetQuestion = questions[questionIndex];
    const existingAnswer = answers.find(
      (a) => a.question.id === targetQuestion.id
    );
    setSelectedAnswer(existingAnswer ? existingAnswer.selected_answer : null);

    hapticFeedback("selection");
  };

  const handleContestEnd = async () => {
    let updatedAnswers = [...answers];
    if (selectedAnswer !== null) {
      const currentQuestion = questions[currentQuestionIndex];
      const isCorrect = selectedAnswer === Number(currentQuestion.answer);
      const newAnswer: ContestAnswer = {
        question: currentQuestion,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        time_taken: 60, // Or your actual timer value
      };

      const existingAnswerIndex = updatedAnswers.findIndex(
        (a) => a.question.id === currentQuestion.id
      );
      if (existingAnswerIndex >= 0) {
        updatedAnswers[existingAnswerIndex] = newAnswer;
      } else {
        updatedAnswers.push(newAnswer);
      }
      setAnswers(updatedAnswers);
    }

    const answeredQuestionIds = new Set(
      updatedAnswers.map((a) => a.question.id)
    );

    // 2. Iterate through ALL contest questions
    questions.forEach((question) => {
      // 3. If a question was not answered, add it to our submission list
      if (!answeredQuestionIds.has(question.id)) {
        const unansweredEntry: ContestAnswer = {
          question: question,
          selected_answer: -1, // As requested for unanswered
          is_correct: false, // Unanswered is always incorrect
          time_taken: 0, // No time was spent on it
        };
        updatedAnswers.push(unansweredEntry);
      }
    });

    if (updatedAnswers.length === 0) {
      toast.error("No answers submitted!", {
        description: "Please answer at least one question before submitting.",
      });
      return;
    }

    // The rest of your function now works correctly because `updatedAnswers`
    // contains entries for ALL questions (answered and unanswered).
    const correctAnswers = updatedAnswers.filter((a) => a.is_correct).length;
    const score = correctAnswers;
    const missed_questions = updatedAnswers
      .filter((a) => !a.is_correct)
      .map((a) => ({
        id: a.question.id,
        selected_answer: a.selected_answer,
      }));
    const endTime = Date.now();
    let time_spend = "00:00:00";
    if (contest.start_time) {
      const seconds = Math.round(
        (endTime - new Date(contest.start_time).getTime()) / 1000
      );
      time_spend = formatTime(seconds); // hh:mm:ss
    }
    const submission = {
      student: {
        id: user?.id?.toString() || "",
        imgurl: user?.photo_url || "",
        name: user?.first_name || "",
      },
      contest_id: contest.id,
      score,
      missed_questions: missed_questions,
      time_spend,
    };
    try {
      setSubmitting(true);
      await submitContestResult(submission);
      toast.success("Submission successful!", {
        description: "Your contest answers have been submitted successfully.",
        icon: <CheckCircle className="w-6 h-6 text-green-500" />,
        position: "bottom-right",
        style: {
          backgroundColor: "#d4edda",
          color: "#155724",
        },
      });
      hideMainButton();
      hapticFeedback("notification", "success");
      setTimeout(() => {
        navigate("/");
      }, 10000);

      setContestEnded(true);
    } catch (e) {
      // Optionally handle error
      toast.error("Submission failed!", {
        description: "Failed to submit your contest answers. Please try again.",
        icon: <XCircle className="w-6 h-6 text-red-500" />,
        position: "bottom-right",
        style: {
          backgroundColor: "#f8d7da",
          color: "#721c24",
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const endContest = async () => {
    showConfirm(
      "Are you sure you want to end the contest?",
      async (confirmed) => {
        if (confirmed) {
          handleContestEnd();
        }
      }
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 text-red-700 dark:text-red-400 p-4 text-center">
        <XCircle className="w-12 h-12 mb-4" />
        <p className="text-lg font-semibold">Failed to Load Contest</p>
        <p className="text-sm">
          {error || "The contest data could not be found."}
        </p>
      </div>
    );
  }

  if (contestEnded) {
    const totalQuestions = questions.length;

    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
            Contest Complete!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Great job! Here's your total summary:
          </p>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {((answers.length / totalQuestions) * 100).toFixed(2)}%
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              {answers.length} out of {totalQuestions} solved
            </div>
          </div>
          <p>You can see your standings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto font-sans">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4 space-x-4">
          <QuestionNavigationDropdown
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
            answers={answers}
            onQuestionSelect={handleQuestionSelect}
          />
          <div className="flex items-center text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <Clock className="w-4 h-4 mr-2" />
            <span className="font-mono text-sm">{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>Progress: {Math.round(progress)}%</span>
          <span>{answers.length} answered</span>
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 text-xs font-medium rounded">
              {currentQuestion.subject}
            </span>
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 text-xs font-medium rounded">
              {currentQuestion.grade}
            </span>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
          {currentQuestion.question_text}
        </h3>

        {/* --- START: Image Display Logic --- */}
        {currentQuestion.question_img && (
          <div className="my-6" onClick={() => setIsImageModalOpen(true)}>
            <img
              src={currentQuestion.question_img}
              alt={`Illustration for question ${currentQuestionIndex + 1}`}
              className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
              onError={(e) => {
                // Hide the image element if it fails to load
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}
        {/* --- END: Image Display Logic --- */}

        {/* Options */}
        <div className="space-y-3 mt-6">
          {currentQuestion.multiple_choice.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                selectedAnswer! - 1 === index
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <div className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center flex-shrink-0 ${
                    selectedAnswer === index + 1
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {selectedAnswer === index + 1 && (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span className="font-medium">
                  {String.fromCharCode(65 + index)}.
                </span>
                <span className="ml-2">{option}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="">
        <div className="flex w-full max-w-2xl mx-auto gap-3">
          {/* Previous Button */}
          <Button
            onClick={handlePreviousQuestion}
            disabled={currentQuestionIndex === 0}
            className="w-1/2 bg-gray-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </Button>

          {/* Next/Finish Button */}
          <Button
            disabled={submitting}
            onClick={
              currentQuestionIndex < questions.length - 1
                ? handleNextQuestion
                : endContest
            }
            className="w-1/2 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Submitting..."
              : currentQuestionIndex < questions.length - 1
              ? "Next"
              : "Finish"}
          </Button>
        </div>
      </div>

      {/* --- START: Image Modal --- */}
      {isImageModalOpen && currentQuestion.question_img && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setIsImageModalOpen(false)}
        >
          <style>{`.animate-fade-in { animation: fadeIn 0.2s ease-out; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          {/* Stop propagation to prevent closing modal when clicking the image itself */}
          <div
            className="relative max-w-4xl max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentQuestion.question_img}
              alt="Enlarged view of the question illustration"
              className="w-auto h-auto max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setIsImageModalOpen(false)}
              className="absolute -top-3 -right-3 bg-white text-gray-800 rounded-full p-1.5 shadow-lg hover:bg-gray-200 transition-transform hover:scale-110"
              aria-label="Close image view"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      {/* --- END: Image Modal --- */}
    </div>
  );
};

export default ContestComponent;
