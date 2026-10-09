
import * as React from "react";
import {
  BarChart,
  Brain,
  BrainCircuit,
  CheckCircle,
  Clock,
  Lightbulb,
  Loader2,
  Lock,
  RotateCcw,
  Send,
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
import { isPremiumRequiredError, aiExplain, getPracticeSubjects, getBankPracticeQuestions } from "../services/aiService";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import { Input } from "../components/ui/input";
import MarkdownMessage from "../components/chat/MarkdownMessage";
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
  answer: number; // 1-based correct option index (canonical convention, B6)
  explanation: string;
  subject: string;
  grade: string;
  chapter: string;
  /** Aligned with multiple_choice: entry i is the photo URL for option i,
   *  or "" when that option is text-only. */
  option_images?: string[];
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
  const navigate = useNavigate();
  const { showBackButton, hideBackButton } = useTelegram();

  // --- Question bank ---
  // Practice now draws from the stored question bank (subjects that already
  // have questions) instead of always calling the LLM. The subject list is
  // populated from the bank, so every offered subject has usable data.
  const [bankSubjects, setBankSubjects] = React.useState<string[]>([]);
  const [questionCount, setQuestionCount] = React.useState(10);

  React.useEffect(() => {
    let active = true;
    getPracticeSubjects()
      .then((subs) => {
        if (active) setBankSubjects(subs);
      })
      .catch(() => {
        /* no bank wired — leave the list empty */
      });
    return () => {
      active = false;
    };
  }, []);

  // --- On-question AI tutor (explain / ask) ---
  // A mini-conversation scoped to the CURRENT question: it resets when the
  // student moves to a different question, so context never bleeds across
  // items. The first entry is a request to "explain this question" (empty
  // ask text); afterwards the student can ask free-text follow-ups.
  const [aiMessages, setAiMessages] = React.useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [aiAskText, setAiAskText] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiPremiumLocked, setAiPremiumLocked] = React.useState(false);

  // Reset the per-question conversation whenever the focused question index
  // changes (or the session is torn down).
  React.useEffect(() => {
    setAiMessages([]);
    setAiAskText("");
    setAiPremiumLocked(false);
  }, [currentQuestionIndex, pageState]);

  const handleAiExplain = async (askText: string) => {
    if (!currentQuestion || aiLoading) return;
    const nextAsk = askText.trim();
    // Append the student turn (an "Explain" press is recorded as a generic
    // request; a typed follow-up records its text) and mark a pending slot.
    const pendingId = `pending-${Date.now()}`;
    const studentTurn =
      nextAsk === "" ? "Explain this question" : nextAsk;
    setAiMessages((prev) => [
      ...prev,
      { role: "user", content: studentTurn },
      { role: "assistant", content: `__pending:${pendingId}__` },
    ]);
    setAiLoading(true);
    try {
      const reply = await aiExplain(questions, currentQuestion, nextAsk);
      setAiMessages((prev) =>
        prev.map((m) =>
          m.content === `__pending:${pendingId}__` ? { role: "assistant", content: reply } : m
        )
      );
    } catch (err) {
      if (isPremiumRequiredError(err)) {
        // The admin switched AI to premium-only and this student is not
        // premium: surface the upgrade prompt and drop the pending slot.
        setAiMessages((prev) => prev.filter((m) => m.content !== `__pending:${pendingId}__`));
        setAiPremiumLocked(true);
        toast.error("AI explanations need a premium account — pay to unlock", {
          style: {
            backgroundColor: "#fff3cd",
            color: "#664d03",
            border: "1px solid #ffe69c",
            padding: "10px",
            borderRadius: "8px",
          },
        });
      } else {
        // Other failure: remove the pending marker and keep the student turn
        // visible so they can retry.
        setAiMessages((prev) => prev.filter((m) => m.content !== `__pending:${pendingId}__`));
        toast.error("Couldn't reach the AI tutor. Please try again.", {
          style: {
            backgroundColor: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            padding: "10px",
            borderRadius: "8px",
          },
        });
      }
    } finally {
      setAiLoading(false);
    }
  };

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
  }, [pageState, showBackButton, hideBackButton]);
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleGenerateSession = async () => {
    if (!settings.subject) return;
    setIsLoading(true);
    try {
      // Practice is drawn from the stored question bank for the selected
      // subject (optionally scoped to the topic/chapter the student typed).
      // This keeps it working with no LLM provider configured.
      const bank_questions = await getBankPracticeQuestions(
        settings.subject,
        settings.topic,
        questionCount
      );

      if (!bank_questions || bank_questions.length === 0) {
        toast.error(
          "No practice questions found for this subject. Try another topic.",
          {
            style: {
              backgroundColor: "#f8d7da",
              color: "#721c24",
              border: "1px solid #f5c6cb",
              padding: "10px",
              borderRadius: "8px",
            },
          }
        );
        setIsLoading(false);
        return;
      }

      setQuestions(bank_questions);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      setTimeLeft(bank_questions.length * 60); // 1 minute per question
      setIsLoading(false);
      setPageState("PRACTICING");
    } catch (err) {
      if (isPremiumRequiredError(err)) {
        // Backend 403: the admin switched /api/ai to premium-only.
        toast.error("AI practice needs a premium account — pay to unlock", {
          style: {
            backgroundColor: "#fff3cd",
            color: "#664d03",
            border: "1px solid #ffe69c",
            padding: "10px",
            borderRadius: "8px",
          },
        });
      } else {
        toast.error("Failed to load practice questions. Please try again.", {
          style: {
            backgroundColor: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            padding: "10px",
            borderRadius: "8px",
          },
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    // Selected answers are 1-based option indices everywhere (B6 canonical:
    // matches stored question.answer and the submission wire format).
    const selected = answerIndex + 1;
    const existingAnswer = answers.find(
      (a) => a.questionIndex === currentQuestionIndex
    );
    if (existingAnswer) {
      setAnswers(
        answers.map((a) =>
          a.questionIndex === currentQuestionIndex
            ? { ...a, selectedAnswer: selected }
            : a
        )
      );
    } else {
      setAnswers([
        ...answers,
        {
          questionIndex: currentQuestionIndex,
          selectedAnswer: selected,
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
  // Topic is optional free text; a subject is required (it must be one of the
  // subjects that actually has stored questions, offered from bankSubjects).
  const canGenerate = Boolean(settings.subject);
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
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
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
                const isCorrectAnswer = currentQuestion.answer === index + 1;

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

                const optionImage =
                  currentQuestion.option_images?.[index] || undefined;

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
                    <div className="ml-2 flex items-center gap-2 flex-1 min-w-0">
                      <span>{option}</span>
                      {optionImage && (
                        <img
                          src={optionImage}
                          alt={`Option ${String.fromCharCode(65 + index)}`}
                          className="h-14 w-14 object-contain rounded-md border border-gray-200 dark:border-gray-600 flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>

          {/* --- Footer with Explanation, AI tutor and Navigation --- */}
          {selectedAnswer !== undefined && selectedAnswer !== null && (
            <CardFooter className="flex-col items-start gap-4 mt-4 p-4 bg-muted/50 rounded-b-lg">
              <div>
                <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
                  <Brain className="w-5 h-5 text-purple-500 mr-2" />
                  Explanation
                </h4>
                <p className="text-sm dark:text-white">
                  {currentQuestion.explanation}
                </p>
              </div>

              {/* --- On-question AI tutor: guided explanation + free ask --- */}
              <div className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white">
                    <Sparkles className="w-5 h-5 text-purple-500 mr-2" />
                    AI Tutor
                  </h4>
                  <span className="text-xs text-muted-foreground dark:text-gray-400">
                    Guided help — it will not give away the answer.
                  </span>
                </div>

                {aiPremiumLocked ? (
                  <div className="w-full rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      <Lock className="h-4 w-4" />
                      AI Tutor is a premium feature
                    </div>
                    <p className="text-xs text-yellow-800/80 dark:text-yellow-200/80">
                      Unlock guided explanations and follow-up questions by
                      upgrading to a premium account.
                    </p>
                    <Button
                      size="sm"
                      className="bg-yellow-500 hover:bg-yellow-600 text-white"
                      onClick={() => navigate("/payment")}
                    >
                      Get Premium
                    </Button>
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    {/* Conversation */}
                    {aiMessages.length > 0 && (
                      <div className="space-y-3">
                        {aiMessages.map((m, i) => {
                          const isPending = m.content.startsWith("__pending:");
                          return (
                            <div key={i}>
                              {m.role === "user" ? (
                                <div className="text-xs text-gray-700 dark:text-gray-300">
                                  <span className="font-semibold">You: </span>
                                  {m.content}
                                </div>
                              ) : isPending ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Thinking…
                                </div>
                              ) : (
                                <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
                                  <MarkdownMessage content={m.content} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Explain button (only before the student has asked) */}
                    {aiMessages.length === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200"
                        disabled={aiLoading}
                        onClick={() => handleAiExplain("")}
                      >
                        {aiLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Lightbulb className="mr-2 h-4 w-4" />
                        )}
                        Explain with AI
                      </Button>
                    )}

                    {/* Free-ask box for follow-ups about this question */}
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ask about this question…"
                        value={aiAskText}
                        disabled={aiLoading}
                        onChange={(e) => setAiAskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && aiAskText.trim() && !aiLoading) {
                            e.preventDefault();
                            const text = aiAskText;
                            setAiAskText("");
                            handleAiExplain(text);
                          }
                        }}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        disabled={aiLoading || !aiAskText.trim()}
                        onClick={() => {
                          const text = aiAskText;
                          setAiAskText("");
                          handleAiExplain(text);
                        }}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
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
            Choose a subject and how many questions to practice. Questions come
            from the saved question bank for that subject.
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
                <SelectValue placeholder={bankSubjects.length ? "Select..." : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                {bankSubjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Topic (optional)</Label>
            <Input
              value={settings.topic}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, topic: e.target.value }))
              }
              placeholder="e.g., Algebra"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="count">Questions</Label>
            <Select
              value={String(questionCount)}
              onValueChange={(val) =>
                setQuestionCount(parseInt(val, 10) || 10)
              }
            >
              <SelectTrigger id="count">
                <SelectValue placeholder="Number of questions" />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20, 25].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center">
          {bankSubjects.length === 0 && !isLoading && (
            <span className="text-xs text-muted-foreground">
              No subjects available yet.
            </span>
          )}
          <Button
            onClick={handleGenerateSession}
            disabled={!canGenerate || isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {isLoading ? "Loading Questions..." : "Start Practice"}
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
    // Both sides are 1-based option indices (B6 canonical convention).
    return question && question.answer === answer.selectedAnswer;
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
                  ? question.answer === userAnswer.selectedAnswer
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
