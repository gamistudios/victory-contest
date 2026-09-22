import {
  Lightbulb,
  Star,
  XCircle,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

export default function ProTips() {
  const [tips] = useState([]);
  const [common_mistakes] = useState([]);
  const [difficulty_explanation] = useState("");
  return (
    <div>
      {/* Pro Tips */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3 border border-yellow-200 dark:border-yellow-800">
        <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
          <Lightbulb className="w-5 h-5 text-yellow-500 mr-2" />
          Tips
        </h4>
        {tips.map((tip, tipIndex) => (
          <div
            key={tipIndex}
            className="flex items-start bg-white/60 dark:bg-gray-800/60 p-2 rounded-md"
          >
            <Star className="w-4 h-4 text-yellow-500 mr-2" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {tip}
            </span>
          </div>
        ))}
      </div>

      {/* Common Mistakes */}
      <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-3 border border-red-200 dark:border-red-800">
        <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          Mistakes
        </h4>
        {common_mistakes.map((mistake, mistakeIndex) => (
          <div
            key={mistakeIndex}
            className="flex items-start bg-white/60 dark:bg-gray-800/60 p-2 rounded-md"
          >
            <XCircle className="w-4 h-4 text-red-500 mr-2" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {mistake}
            </span>
          </div>
        ))}
      </div>

      {/* Difficulty Analysis */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3 border border-purple-200 dark:border-purple-800">
        <h4 className="flex items-center text-base font-bold text-gray-800 dark:text-white mb-2">
          <TrendingUp className="w-5 h-5 text-purple-500 mr-2" />
          Difficulty
        </h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {difficulty_explanation}
        </p>
      </div>

      {/* Statistics */}
      {/* <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-center border border-blue-200 dark:border-blue-800">
          <Timer className="w-5 h-5 text-blue-500 mx-auto" />
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {average_time}s
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300">
            Avg Time
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md text-center border border-green-200 dark:border-green-800">
          <Target className="w-5 h-5 text-green-500 mx-auto" />
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {question.success_rate}%
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">
            Success
          </div>
        </div>
      </div> */}
    </div>
  );
}
