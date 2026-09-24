import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UserStats } from "../../types/dashboard";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
} from "recharts";

interface SessionsChartProps {
  userStats: UserStats;
}

// 🎨 Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div
            key={`item-${index}`}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name.charAt(0).toUpperCase() + entry.name.slice(1)}
            </span>
            <span className="font-semibold text-gray-800">
              {entry.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function SessionsChart({ userStats }: SessionsChartProps) {
  const generateLabels = (dataLength: number) => {
    const labels = [];
    const currentDate = new Date();

    for (let i = dataLength - 1; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - i);
      const label = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      labels.push(label);
    }
    return labels;
  };

  const totalUsers =
    userStats.by_gender.male +
    userStats.by_gender.female +
    userStats.by_gender.other;

  const growthTrend = userStats.growth_trend;

  // Convert daily registration data to cumulative growth data
  const displayData = growthTrend.reduce(
    (acc: number[], current: number, index: number) => {
      const cumulative = index === 0 ? current : acc[index - 1] + current;
      acc.push(cumulative);
      return acc;
    },
    []
  );

  // If all trend data is zero but we have users, show the total at the end
  const hasAnyTrendData = displayData.some((val) => val > 0);
  if (!hasAnyTrendData && totalUsers > 0) {
    // Set the last day to show the total users (assuming they were all registered before the 30-day window)
    displayData[displayData.length - 1] = totalUsers;
  }

  const labels = generateLabels(displayData.length);

  const chartData = displayData.map((total, i) => {
    const femaleRatio = totalUsers
      ? userStats.by_gender.female / totalUsers
      : 0;
    const maleRatio = totalUsers ? userStats.by_gender.male / totalUsers : 0;
    const otherRatio = totalUsers ? userStats.by_gender.other / totalUsers : 0;

    return {
      date: labels[i],
      female: Math.round(total * femaleRatio),
      male: Math.round(total * maleRatio),
      other: Math.round(total * otherRatio),
    };
  });

  // Calculate growth percentage with proper handling of edge cases
  const calculateGrowthPercentage = () => {
    if (growthTrend.length < 2) return 0;

    const firstValue = growthTrend[0];
    const lastValue = growthTrend[growthTrend.length - 1];

    // If first value is 0, calculate based on whether we have growth
    if (firstValue === 0) {
      return lastValue > 0 ? 100 : 0; // 100% growth from 0, or 0% if still 0
    }

    // Normal percentage calculation
    const percentage = ((lastValue - firstValue) / firstValue) * 100;

    // Handle infinity and NaN cases
    if (!isFinite(percentage)) return 0;

    return Math.round(percentage);
  };

  const growthPercentage = calculateGrowthPercentage();

  return (
    <Card className="w-full rounded-2xl shadow-sm">
      <CardContent className="p-4 space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Contestant
        </h2>

        <div className="flex flex-col space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold">
              {totalUsers.toLocaleString()}
            </p>
            <span
              className={cn(
                "px-2 py-0.5 text-xs font-semibold rounded-full",
                growthPercentage >= 0
                  ? "bg-green-100 text-green-600"
                  : "bg-red-100 text-red-600"
              )}
            >
              {growthPercentage >= 0 ? "+" : ""}
              {growthPercentage}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Total contestants growth over the last 30 days
          </p>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="female" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="male" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="other" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e40af" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="female"
                stroke="#60a5fa"
                fill="url(#female)"
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="male"
                stroke="#3b82f6"
                fill="url(#male)"
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="other"
                stroke="#1e40af"
                fill="url(#other)"
                stackId="1"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
