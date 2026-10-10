import { StudentProfileStats } from "@/services/studentServices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Target, TrendingUp, Award } from "lucide-react";

interface StatsCardsProps {
  /** Aggregated quickstat numbers; null while unavailable or on failure. */
  stats: StudentProfileStats | null;
}

export function StatsCards({ stats }: StatsCardsProps) {
  // Values degrade to "—" when the quickstat call failed or is pending —
  // a stats outage must never crash the profile page.
  const cards = [
    {
      title: "Total Points",
      value: stats ? stats.totalPoints : "—",
      icon: Trophy,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-l-yellow-500",
    },
    {
      title: "Contests Participated",
      value: stats ? stats.totalContests : "—",
      icon: Award,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-l-blue-500",
    },
    {
      title: "Questions Answered",
      value: stats ? stats.totalQuestions : "—",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-l-purple-500",
    },
    {
      title: "Overall Accuracy",
      value: stats ? `${stats.accuracy}%` : "—",
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-l-emerald-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
      {cards.map((card, index) => (
        <Card
          key={index}
          className={`bg-card border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${card.borderColor}`}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 min-w-0">
              {card.title}
            </CardTitle>
            <div className={`${card.bgColor} p-2.5 rounded-lg shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">
              {card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
