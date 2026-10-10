import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  title: string;
  value: string;
  interval: string;
  trend: "up" | "down" | "neutral";
  data: number[];
  change?: string;
};

export default function StatCard({
  title,
  value,
  interval,
  trend,
  data,
  change,
}: StatCardProps) {
  // Generate last N days labels
  const generateDailyLabels = (dataLength: number) => {
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

  const safeData =
    Array.isArray(data) && data.length
      ? data.map((val) =>
          Number.isFinite(Number(val)) && Number(val) >= 0 ? Math.floor(val) : 0
        )
      : Array(30).fill(0);

  const labels = generateDailyLabels(safeData.length);
  const chartData = safeData.map((val, i) => ({ date: labels[i], value: val }));
  const hasNonZeroData = chartData.some((p) => p.value > 0);

  const badgeColors = {
    up: "bg-green-100 text-green-700",
    down: "bg-red-100 text-red-700",
    neutral: "bg-gray-100 text-gray-700",
  };

  const defaultTrendValues = { up: "+25%", down: "-25%", neutral: "+5%" };

  return (
    <Card className="h-full flex flex-col min-w-0">
      <CardHeader className="pb-2 px-4 pt-4 sm:p-6 sm:pb-2">
        <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col justify-between flex-grow gap-2 px-4 pb-4 sm:p-6 sm:pt-0">
        <div className="flex justify-between items-center gap-2 min-w-0">
          <span className="text-xl sm:text-2xl font-bold truncate">
            {value || "0"}
          </span>
          <Badge
            className={cn(
              "text-xs font-semibold shrink-0",
              badgeColors[trend]
            )}
          >
            {change || defaultTrendValues[trend]}
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm">{interval}</CardDescription>

        <div className="w-full h-10 sm:h-14 min-w-0">
          {hasNonZeroData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id={`grad-${title}-${trend}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={
                        trend === "up"
                          ? "hsl(var(--success))"
                          : trend === "down"
                          ? "hsl(var(--destructive))"
                          : "hsl(var(--muted-foreground))"
                      }
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        trend === "up"
                          ? "hsl(var(--success))"
                          : trend === "down"
                          ? "hsl(var(--destructive))"
                          : "hsl(var(--muted-foreground))"
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip cursor={false} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={
                    trend === "up"
                      ? "hsl(var(--success))"
                      : trend === "down"
                      ? "hsl(var(--destructive))"
                      : "hsl(var(--muted-foreground))"
                  }
                  fill={`url(#grad-${title}-${trend})`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              No activity in the last 30 days
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
