"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { PageViewStats } from "../../types/dashboard";

interface PageViewsBarChartProps {
  pageViewStats: PageViewStats;
}

interface TooltipEntry {
  value?: number | string;
  payload?: { day?: string };
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-2 text-sm max-w-[80vw]">
        <p className="font-semibold text-gray-800">{payload[0]?.payload?.day}</p>
        <p className="text-blue-500">Views: {payload[0]?.value}</p>
      </div>
    );
  }
  return null;
};

export default function PageViewsBarChart({
  pageViewStats,
}: PageViewsBarChartProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  // Calculate total views and growth
  const totalViews = pageViewStats.total_views;
  const viewsByDay = pageViewStats.views_by_day;

  // Calculate growth percentage (comparing first and last week)
  const firstWeekViews = viewsByDay
    .slice(0, 7)
    .reduce((sum, val) => sum + val, 0);
  const lastWeekViews = viewsByDay.slice(-7).reduce((sum, val) => sum + val, 0);

  const viewsGrowth =
    firstWeekViews > 0
      ? Math.round(((lastWeekViews - firstWeekViews) / firstWeekViews) * 100)
      : lastWeekViews > 0
      ? 100
      : 0;

  // Generate day labels for the last 30 days
  const generateDayLabels = (dataLength: number) => {
    const labels = [];
    const currentDate = new Date();
    for (let i = dataLength - 1; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - i);
      labels.push(
        date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      );
    }
    return labels;
  };

  const dayLabels = generateDayLabels(viewsByDay.length);

  // Build chart data - group by weeks for better visualization
  const chartData = [];
  for (let i = 0; i < viewsByDay.length; i += 7) {
    const weekViews = viewsByDay
      .slice(i, i + 7)
      .reduce((sum, val) => sum + val, 0);
    const weekStart = dayLabels[i];
    const weekEnd = dayLabels[Math.min(i + 6, dayLabels.length - 1)];

    chartData.push({
      week: `${weekStart} - ${weekEnd}`,
      views: weekViews,
      day: `Week ${Math.floor(i / 7) + 1}`,
    });
  }

  return (
    <Card className="w-full min-w-0 rounded-2xl shadow-sm">
      <CardHeader className="pb-2 px-4 pt-4 sm:p-6 sm:pb-2">
        <CardTitle className="text-sm font-medium">Page Views</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 pb-4 sm:p-6 sm:pt-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xl sm:text-2xl font-bold break-words">
            {totalViews.toLocaleString()}
          </span>
          <Badge
            className={cn(
              "text-xs font-semibold shrink-0",
              viewsGrowth >= 0
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            )}
          >
            {viewsGrowth >= 0 ? "+" : ""}
            {viewsGrowth}%
          </Badge>
        </div>
        <CardDescription>
          Total page views for the last 30 days ({pageViewStats.unique_visitors}{" "}
          unique visitors)
        </CardDescription>

        <div className="w-full min-w-0 h-40 sm:h-52 lg:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                left: isPhone ? 0 : 20,
                right: isPhone ? 2 : 10,
                top: 12,
                bottom: 8,
              }}
            >
              <XAxis
                dataKey="day"
                tick={{ fontSize: isPhone ? 9 : 12 }}
                tickMargin={6}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: isPhone ? 9 : 12 }}
                width={isPhone ? 34 : 44}
                tickMargin={4}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="views"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={isPhone ? 28 : 56}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
