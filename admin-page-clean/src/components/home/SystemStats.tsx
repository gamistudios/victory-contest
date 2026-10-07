"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen, Landmark, Images, ListChecks } from "lucide-react";
import { QuestionStats, PaymentStats } from "@/types/dashboard";

interface SystemStatsProps {
  questionStats: QuestionStats;
  paymentStats: PaymentStats;
}

interface TooltipEntry {
  value?: number | string;
  name?: string | number;
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
        <p className="font-semibold text-gray-800">
          {payload[0]?.payload?.day}
        </p>
        <p className="text-blue-500">Requests: {payload[0]?.value}</p>
      </div>
    );
  }
  return null;
};

// A compact metric tile: an icon, a big number and a caption.
function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-2 sm:p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// Renders the system-wide Question Bank and Payments blocks of the dashboard
// (client task 4). Purely presentational: the numbers come pre-aggregated
// from the /api/admin/dashboard endpoint.
export default function SystemStats({
  questionStats,
  paymentStats,
}: SystemStatsProps) {
  const topSubjects = questionStats.by_subject?.slice(0, 5) ?? [];
  const paymentTrend = paymentStats.trend ?? [];
  const dayLabels = paymentTrend.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (paymentTrend.length - 1 - i));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  const chartData = paymentTrend.map((v, i) => ({
    day: dayLabels[i],
    value: v,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* --- Question Bank --- */}
      <Card className="w-full min-w-0 rounded-2xl shadow-sm">
        <CardHeader className="pb-2 px-4 pt-4 sm:p-6 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-blue-500" />
            Question Bank
          </CardTitle>
          <CardDescription className="text-xs">
            {questionStats.total.toLocaleString()} stored questions
            {questionStats.by_subject.length > 0 &&
              ` across ${questionStats.by_subject.length} subject(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <MetricTile
              icon={<ListChecks className="h-4 w-4" />}
              label="Total"
              value={questionStats.total.toLocaleString()}
            />
            <MetricTile
              icon={<BookOpen className="h-4 w-4" />}
              label="With explanation"
              value={questionStats.with_explanation.toLocaleString()}
            />
            <MetricTile
              icon={<Images className="h-4 w-4" />}
              label="With image"
              value={questionStats.with_image.toLocaleString()}
            />
            <MetricTile
              icon={<ListChecks className="h-4 w-4" />}
              label="Subjects"
              value={questionStats.by_subject.length.toString()}
            />
          </div>

          {topSubjects.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Top subjects
              </p>
              <div className="flex flex-wrap gap-2">
                {topSubjects.map((s) => (
                  <Badge
                    key={s.subject}
                    variant="secondary"
                    className="text-xs font-medium"
                  >
                    {s.subject} · {s.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Payments --- */}
      <Card className="w-full min-w-0 rounded-2xl shadow-sm">
        <CardHeader className="pb-2 px-4 pt-4 sm:p-6 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Landmark className="h-4 w-4 text-emerald-500" />
            Payments
          </CardTitle>
          <CardDescription className="text-xs">
            {paymentStats.total.toLocaleString()} requests ·{" "}
            {paymentStats.approved_revenue.toLocaleString()} ETB approved
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MetricTile
              icon={<Landmark className="h-4 w-4" />}
              label="Pending"
              value={paymentStats.pending.toLocaleString()}
            />
            <MetricTile
              icon={<Landmark className="h-4 w-4" />}
              label="Approved"
              value={paymentStats.approved.toLocaleString()}
            />
            <MetricTile
              icon={<Landmark className="h-4 w-4" />}
              label="Rejected"
              value={paymentStats.rejected.toLocaleString()}
            />
          </div>

          <div className="mt-4 h-36 sm:h-40 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9 }}
                  interval={Math.max(0, Math.floor(dayLabels.length / 6) - 1)}
                  tickMargin={4}
                />
                <YAxis tick={{ fontSize: 9 }} width={28} tickMargin={4} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
