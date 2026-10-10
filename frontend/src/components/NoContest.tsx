import React from "react";
import { Calendar, Trophy, Clock } from "lucide-react";

interface NoContestsProps {
  type: "active" | "past";
}

const NoContests: React.FC<NoContestsProps> = ({ type }) => {
  const isActive = type === "active";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        {isActive ? (
          <Calendar className="w-10 h-10 text-gray-400" />
        ) : (
          <Trophy className="w-10 h-10 text-gray-400" />
        )}
      </div>

      <h3 className="text-xl font-semibold text-gray-800 mb-2">
        {isActive ? "No Active Contests" : "No Past Contests"}
      </h3>

      <p className="text-gray-600 text-center mb-6 max-w-sm">
        {isActive
          ? "There are currently no active contests available. New contests will be announced soon!"
          : "You haven't participated in any contests yet. Join an active contest to see your history here."}
      </p>

      {!isActive && (
        <div className="bg-green-50 p-4 rounded-xl border border-green-200 max-w-sm">
          <div className="flex items-start space-x-3">
            <Clock className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-green-800 mb-1">
                Ready to Start?
              </h4>
              <p className="text-sm text-green-700">
                Join your first contest to start building your performance
                history and compete with others.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoContests;
