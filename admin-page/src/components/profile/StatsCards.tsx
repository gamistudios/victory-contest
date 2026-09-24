import { User } from "@/types/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Target, TrendingUp, Award } from "lucide-react";

interface StatsCardsProps {
  user: User;
}

export function StatsCards({ user }: StatsCardsProps) {
  // Directly use the pre-calculated stats from the user object
  const stats = [
    {
      title: "Total Points",
      // This value comes from the root of the user object
      value: user.stat.total_questions,
      icon: Trophy,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-l-yellow-500",
    },
    {
      title: "Contests Participated",
      // This value now comes from user.stat
      value: user.stat?.total_contests ?? "0",
      icon: Award,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-l-blue-500",
    },
    {
      title: "Questions Answered",
      // This value now comes from user.stat
      value: user.stat?.total_questions ?? "0",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-l-purple-500",
    },
    {
      title: "Overall Accuracy",
      // This value now comes from user.stat
      value: `${Math.round(user.stat?.accuracy || 0)}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-l-emerald-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <Card
          key={index}
          className={`bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${stat.borderColor}`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              {stat.title}
            </CardTitle>
            <div className={`${stat.bgColor} p-2.5 rounded-lg`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
