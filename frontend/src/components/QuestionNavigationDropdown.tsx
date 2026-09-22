import React from "react";
import {
  ChevronDown,
  CheckCircle,
  Circle,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Question, ContestAnswer } from "../types";
import { cn } from "../lib/utils";

interface QuestionNavigationDropdownProps {
  questions: Question[];
  currentQuestionIndex: number;
  answers: ContestAnswer[];
  onQuestionSelect: (index: number) => void;
}

const QuestionNavigationDropdown: React.FC<QuestionNavigationDropdownProps> = ({
  questions,
  currentQuestionIndex,
  answers,
  onQuestionSelect,
}) => {
  const getQuestionStatus = (questionIndex: number) => {
    const question = questions[questionIndex];
    const answer = answers.find((a) => a.question.id === question.id);

    if (!answer) {
      return questionIndex < currentQuestionIndex ? "skipped" : "unanswered";
    }

    return "solved";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "solved":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "incorrect":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "skipped":
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string, isCurrent: boolean) => {
    if (isCurrent) {
      return "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    }

    switch (status) {
      case "solved":
        return "hover:bg-green-50 dark:hover:bg-green-900/20";
      case "incorrect":
        return "hover:bg-red-50 dark:hover:bg-red-900/20";
      case "skipped":
        return "hover:bg-gray-50 dark:hover:bg-gray-700";
      default:
        return "hover:bg-blue-50 dark:hover:bg-blue-900/20";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "solved":
        return "Solved";
      case "incorrect":
        return "Incorrect";
      case "skipped":
        return "Skipped";
      default:
        return "Not answered";
    }
  };

  const getStatusCounts = () => {
    const counts = {
      solved: 0,
      skipped: 0,
      unanswered: 0,
    };

    questions.forEach((_, index) => {
      const status = getQuestionStatus(index);
      counts[status as keyof typeof counts]++;
    });

    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Question {currentQuestionIndex + 1} of {questions.length}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Question Navigation</DropdownMenuLabel>

        {/* Status Summary */}
        <div className="px-2 py-2 mb-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-1">
              <CheckCircle className="w-3 h-3 text-green-400" />
              <span className="text-gray-600 dark:text-gray-400">
                Solved: {statusCounts.solved}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3 text-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Remaining: {statusCounts.unanswered + statusCounts.skipped}
              </span>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Question List */}
        <div className="max-h-64 overflow-y-auto">
          {questions.map((question, index) => {
            const status = getQuestionStatus(index);
            const isCurrent = index === currentQuestionIndex;

            return (
              <DropdownMenuItem
                key={question.id}
                onClick={() => onQuestionSelect(index)}
                className={cn(
                  "flex items-center justify-between p-3 cursor-pointer transition-colors",
                  getStatusColor(status, isCurrent),
                  isCurrent && "border-l-2"
                )}
              >
                <div className="flex items-center space-x-3 flex-1">
                  {getStatusIcon(status)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm">Q{index + 1}</span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {question.question_text.length > 40
                        ? `${question.question_text.substring(0, 40)}...`
                        : question.question_text}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {getStatusText(status)}
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default QuestionNavigationDropdown;
