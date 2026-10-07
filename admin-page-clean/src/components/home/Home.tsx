import { useState, useEffect, useCallback } from "react";
import StatCard, { StatCardProps } from "./StatCard";

import { Box, Stack, Typography, Grid } from "@mui/material";
import SessionsChart from "./SessionsChart";
import PageViewsBarChart from "./PageViewsBarChart";
import ChartUserByCountry from "./ChartUserByCountry";
import SystemStats from "./SystemStats";
import CustomizedDataGrid from "./CustomizedDataGrid";
import { columns } from "./gridData";
import { getDashboardStats } from "../../services/api";
import { DashboardStatsResponse } from "../../types/dashboard";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

export default function Home() {
  const [dashboardData, setDashboardData] =
    useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(
    async (refresh = false) => {
      setLoading(true);
      if (refresh) setRefreshing(true);
      try {
        const data = await getDashboardStats(refresh);
        setDashboardData(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          width: "100%",
          minHeight: { xs: "16rem", md: "25rem" },
        }}
      >
        <Typography variant="body2">Loading your dashboard...</Typography>
      </Box>
    );
  }

  if (error || !dashboardData) {
    return (
      <Box
        sx={{
          width: "100%",
          maxWidth: { sm: "100%", md: "106.25rem" },
          p: { xs: 1, sm: 2 },
        }}
      >
        <Typography color="error" variant="h6">
          {error || "No data available"}
        </Typography>
      </Box>
    );
  }

  // Transform dashboard data to StatCard format
  const statCards: StatCardProps[] = [
    {
      title: "Users",
      value: dashboardData.overview.total_users.value,
      interval: "Last 30 days",
      trend: dashboardData.overview.total_users.trend,
      data: dashboardData.overview.total_users.data,
      change: dashboardData.overview.total_users.change,
    },
    {
      title: "Revenue",
      value: dashboardData.overview.revenue.value,
      interval: "Last 30 days",
      trend: dashboardData.overview.revenue.trend,
      data: dashboardData.overview.revenue.data,
      change: dashboardData.overview.revenue.change,
    },
    {
      title: "Contests",
      value: dashboardData.overview.total_contests.value,
      interval: "Last 30 days",
      trend: dashboardData.overview.total_contests.trend,
      data: dashboardData.overview.total_contests.data,
      change: dashboardData.overview.total_contests.change,
    },
    {
      title: "Questions",
      value: String(dashboardData.question_stats?.total ?? 0),
      interval: "Stored in bank",
      trend: "neutral",
      data: Array(30).fill(0),
      change: "bank",
    },
  ];

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: { sm: "100%", md: "106.25rem" },
        p: { xs: 1, sm: 2 },
        overflowX: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: "center",
          gap: 2,
          mb: 2,
        }}
      >
        <Typography
          component="h2"
          variant="h6"
          sx={{ fontFamily: "'Public Sans',sans-serif", fontWeight: 700 }}
        >
          Overview
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            ml: { xs: 0, sm: "auto" },
          }}
        >
          {dashboardData.generated_at && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              Updated {new Date(dashboardData.generated_at).toLocaleString()}
            </Typography>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing || loading}
            className="gap-1"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </Box>
      </Box>
      <Grid
        container
        spacing={{ xs: 1.5, sm: 2 }}
        columns={12}
        sx={{ mb: (theme) => theme.spacing(2) }}
      >
        {statCards.map((card, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6 }}>
          <SessionsChart userStats={dashboardData.user_stats} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <PageViewsBarChart pageViewStats={dashboardData.page_view_stats} />
        </Grid>
      </Grid>
      <Typography
        component="h2"
        variant="h6"
        sx={{ mb: 2, fontFamily: "'Public Sans',sans-serif", fontWeight: 700 }}
      >
        System
      </Typography>
      <Box sx={{ mb: (theme) => theme.spacing(2) }}>
        <SystemStats
          questionStats={dashboardData.question_stats}
          paymentStats={dashboardData.payment_stats}
        />
      </Box>
      <Typography
        component="h2"
        variant="h6"
        sx={{ mb: 2, fontFamily: "'Public Sans',sans-serif", fontWeight: 700 }}
      >
        Details
      </Typography>
      <Grid container spacing={{ xs: 1.5, sm: 2 }} columns={12}>
        <Grid size={{ xs: 12, lg: 9 }}>
          <CustomizedDataGrid
            value={{ rows: dashboardData.recent_activity, columns }}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack spacing={2} direction={{ xs: "column", sm: "row", lg: "column" }}>
            <ChartUserByCountry userStats={dashboardData.user_stats} />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
