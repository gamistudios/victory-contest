"use client";

import * as React from "react";
import {
  BarChart,
  Brain,
  BrainCircuit,
  CheckCircle,
  Clock,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { getAiGeneratedQuestions } from "../services/aiService";
import { toast } from "sonner";
import { useTelegram } from "../hooks/useTelegram";
import { Input } from "../components/ui/input";
import ComingSoon from "../components/ComingSoon";
// import { Skeleton } from "@/components/ui/skeleton";
// NOTE: QuestionNavigationDropdown is a placeholder for your custom component
// import QuestionNavigationDropdown from "../components/QuestionNavigationDropdown";

// --- TYPE DEFINITIONS ---
type PageState = "SETTINGS" | "PRACTICING" | "RESULT";

interface PracticeSettings {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard" | "";
}

interface AIQuestion {
  question_text: string;
  question_image?: string | null;
  multiple_choice: string[];
  answer: number; // The correct answer index
  explanation: string;
  subject: string;
  grade: string;
  chapter: string;
}

interface Answer {
  questionIndex: number;
  selectedAnswer: number;
}

// --- INITIAL STATES ---
const initialSettings: PracticeSettings = {
  subject: "",
  topic: "",
  difficulty: "",
};

export function AIPracticePage() {
  const [pageState, setPageState] = React.useState<PageState>("SETTINGS");
  const [settings, setSettings] =
    React.useState<PracticeSettings>(initialSettings);
  const [questions, setQuestions] = React.useState<AIQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Answer[]>([]);
  const [timeLeft, setTimeLeft] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const { showBackButton, hideBackButton } = useTelegram();

  // --- TIMER LOGIC ---
  React.useEffect(() => {
    if (pageState === "PRACTICING" && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, pageState]);

  React.useEffect(() => {
    if (pageState === "PRACTICING") {
      showBackButton(() => {
        setPageState("SETTINGS");
        setQuestions([]);
        setSettings(initialSettings);
        setCurrentQuestionIndex(0);
        setAnswers([]);
        setTimeLeft(0);
        setIsLoading(false);
      });
    } else {
      hideBackButton();
    }
  }, [pageState]);
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleGenerateSession = async () => {
    setIsLoading(true);
    // API call would happen here, fetching an array of questions
    try {
      const ai_questions = await getAiGeneratedQuestions(settings);

      setQuestions(ai_questions);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      setTimeLeft(ai_questions.length * 60); // 1 minute per question
      setIsLoading(false);
      setPageState("PRACTICING");
    } catch (error) {
      toast.error("Failed to generate questions. Please try again.", {
        style: {
          backgroundColor: "#f8d7da",
          color: "#721c24",
          border: "1px solid #f5c6cb",
          padding: "10px",
          borderRadius: "8px",
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    const existingAnswer = answers.find(
      (a) => a.questionIndex === currentQuestionIndex
    );
    if (existingAnswer) {
      setAnswers(
        answers.map((a) =>
          a.questionIndex === currentQuestionIndex
            ? { ...a, selectedAnswer: answerIndex + 1 }
            : a
        )
      );
    } else {
      setAnswers([
        ...answers,
        {
          questionIndex: currentQuestionIndex,
          selectedAnswer: answerIndex + 1,
        },
      ]);
    }
  };

  const resetSession = () => {
    setPageState("SETTINGS");
    setQuestions([]);
    setSettings(initialSettings);
  };

  const progress = (answers.length / questions.length) * 100;
  const currentQuestion = questions[currentQuestionIndex];
  const selectedAnswer = answers.find(
    (a) => a.questionIndex === currentQuestionIndex
  )?.selectedAnswer;
  const canGenerate = settings.subject && settings.topic && settings.difficulty;
  const totalSessionTime = questions.length * 60; // Assuming 1 min per question
  const timeSpent = totalSessionTime - timeLeft;
  const handleNextQuestion = () => {
    setCurrentQuestionIndex((prev) => {
      if (prev < questions.length - 1) {
        return prev + 1;
      }
      return prev; // Stay on the last question
    });
  };
  const endSession = () => {
    setPageState("RESULT");
  };

  if (pageState === "RESULT") {
    return (
      <AIPracticeResultPage
        questions={questions}
        answers={answers}
        timeSpent={timeSpent}
        onRestart={resetSession}
      />
    );
  }
  if (pageState === "PRACTICING") {
    if (!currentQuestion) return <div>Session over or error.</div>; // Or a summary screen

    return (
      <div className="w-full max-w-3xl mx-auto p-4">
        {/* --- Top Bar and Progress --- */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4 space-x-4">
            {/* Your QuestionNavigationDropdown would go here */}
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="flex items-center text-black dark:border-none dark:text-white dark:bg-gray-800 bg-card px-3 py-2 rounded-lg border">
              <Clock className="w-4 h-4 mr-2" />
              <span className="font-mono text-sm">{formatTime(timeLeft)}</span>
            </div>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* --- Question Card --- */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-primary/10 text-black dark:text-white text-xs font-medium rounded">
                {currentQuestion.subject}
              </span>
              <span className="px-2 py-1 bg-white dark:bg-gray-700 text-muted-black dark:text-white text-xs font-medium rounded">
                {currentQuestion.grade}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="text-base font-semibold text-black dark:text-white mb-6">
              {currentQuestion.question_text}
            </h3>
            <div className="space-y-3">
              {currentQuestion.multiple_choice.map((option, index) => {
                // Determine the style for each option after an answer is selected
                const hasAnswered =
                  selectedAnswer !== undefined && selectedAnswer !== null;
                const isSelected = selectedAnswer === index + 1;
                const isCorrectAnswer = currentQuestion.answer === index;

                let optionClass =
                  "border-border bg-transparent hover:border-muted-foreground/50";
                if (hasAnswered) {
                  if (isCorrectAnswer) {
                    optionClass =
                      "border-green-500 border-2 bg-green-500/10 text-green-700 dark:text-green-400";
                  } else if (isSelected) {
                    optionClass =
                      "border-red-500 border-2 bg-red-500/10 text-red-700 dark:text-red-400";
                  } else {
                    optionClass = "opacity-60"; // Fade out other options
                  }
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={hasAnswered} // Disable button after answering
                    className={`w-full text-left p-4 rounded-lg transition-all duration-200 flex items-center ${optionClass}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "border-current bg-current"
                          : "border-muted-foreground"
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 bg-background rounded-full"></div>
                      )}
                    </div>
                    <span className="font-medium">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <span className="ml-2">{option}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>

          {/* --- Footer with Explanation and Navigation --- */}
          {selectedAnswer !== undefined && selectedAnswer !== null && (
            <CardFooter className="flex-col items-start gap-4 mt-4 p-4 bg-muted/50 rounded-b-lg">
              <div>
                <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
                  <Brain className="w-5 h-5 text-blue-500 mr-2" />
                  Explanation
                </h4>
                <p className="text-sm dark:text-white">
                  {currentQuestion.explanation}
                </p>
              </div>
              <Button
                onClick={
                  currentQuestionIndex < questions.length - 1
                    ? handleNextQuestion
                    : endSession
                }
                className="w-full"
              >
                {currentQuestionIndex < questions.length - 1
                  ? "Next Question"
                  : "Finish Session"}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    );
  }
  return <ComingSoon />;

  // Initial Settings View
  return (
    <div className="w-full max-w-3xl space-y-8 p-3">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight flex items-center justify-center">
          <BrainCircuit className="mr-3 h-8 w-8 text-black dark:text-white" />
          AI Practice Session
        </h1>
        <p className="mt-2 text-muted-foreground dark:text-gray-400">
          Select your criteria to start a practice session.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Practice Settings</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Choose your subject, grade, and difficulty level.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Select
              value={settings.subject}
              onValueChange={(val) =>
                setSettings((s) => ({ ...s, subject: val }))
              }
            >
              <SelectTrigger id="subject">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Math">Mathematics</SelectItem>
                <SelectItem value="Physics">Physics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade">Topic</Label>
            <Input
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, topic: e.target.value }))
              }
              placeholder="e.g., Algebra"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select
              value={settings.difficulty}
              onValueChange={(val) =>
                setSettings((s) => ({ ...s, difficulty: val as any }))
              }
            >
              <SelectTrigger id="difficulty">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={handleGenerateSession}
            disabled={!canGenerate || isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {isLoading ? "Generating Session..." : "Start Practice"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};
interface ResultPageProps {
  questions: AIQuestion[];
  answers: Answer[];
  timeSpent: number; // Time spent in seconds
  onRestart: () => void; // Function to restart the session
}
export function AIPracticeResultPage({
  questions,
  answers,
  timeSpent,
  onRestart,
}: ResultPageProps) {
  // --- Calculate Stats ---
  const totalQuestions = questions.length;
  const correctAnswers = answers.filter((answer) => {
    const question = questions[answer.questionIndex];
    // Adjust for 0-based index vs 1-based selectedAnswer
    return question && question.answer === answer.selectedAnswer - 1;
  }).length;

  const accuracy =
    totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

  return (
    <div className="w-full max-w-3xl mx-auto p-4 animate-in fade-in-50 duration-500">
      <Card>
        <CardHeader className="text-center">
          <Trophy className="mx-auto h-12 w-12 text-yellow-500 mb-2" />
          <CardTitle className="text-3xl font-bold">
            Session Complete!
          </CardTitle>
          <CardDescription>
            Here's a summary of your performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Key Stats Grid */}
          <div className="grid grid-cols-3  gap-4 text-center mb-8 p-4 bg-muted/50 rounded-lg">
            <div className="flex flex-col items-center">
              <BarChart className="h-6 w-6 mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">
                {correctAnswers} / {totalQuestions}
              </p>
              <p className="text-sm text-muted-foreground">Score</p>
            </div>
            <div className="flex flex-col items-center">
              <Target className="h-6 w-6 mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{accuracy.toFixed(0)}%</p>
              <p className="text-sm text-muted-foreground">Accuracy</p>
            </div>
            <div className="flex flex-col items-center">
              <Timer className="h-6 w-6 mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{formatTime(timeSpent)}</p>
              <p className="text-sm text-muted-foreground">Time Spent</p>
            </div>
          </div>

          {/* Question by Question Review */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Question Review</h3>
            <div className="space-y-2">
              {questions.map((question, index) => {
                const userAnswer = answers.find(
                  (a) => a.questionIndex === index
                );
                const isCorrect = userAnswer
                  ? question.answer === userAnswer.selectedAnswer - 1
                  : false;

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-background rounded-md border"
                  >
                    <p className="text-sm font-medium truncate pr-4">
                      {index + 1}. {question.question_text}
                    </p>
                    {isCorrect ? (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={onRestart} className="w-full" size="lg">
            <RotateCcw className="mr-2 h-4 w-4" />
            Practice Again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
