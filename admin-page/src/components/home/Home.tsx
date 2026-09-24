import { useState, useEffect } from "react";
import StatCard, { StatCardProps } from "./StatCard";

import { Box, Stack, Typography, Grid } from "@mui/material";
import HighlightedCard from "./HighlightedCard";
import SessionsChart from "./SessionsChart";
import PageViewsBarChart from "./PageViewsBarChart";
import ChartUserByCountry from "./ChartUserByCountry";
import CustomizedDataGrid from "./CustomizedDataGrid";
import { columns } from "./gridData";
import { getDashboardStats } from "../../services/api";
import { DashboardStatsResponse } from "../../types/dashboard";

export default function Home() {
  const [dashboardData, setDashboardData] =
    useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const data = await getDashboardStats();
        setDashboardData(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
        }}
      >
        Loading your dashboard...
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <Box sx={{ width: "100%", maxWidth: { sm: "100%", md: "1700px" }, p: 2 }}>
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
      title: "Contest count",
      value: dashboardData.overview.total_contests.value,
      interval: "Last 30 days",
      trend: dashboardData.overview.total_contests.trend,
      data: dashboardData.overview.total_contests.data,
      change: dashboardData.overview.total_contests.change,
    },
  ];

  return (
    <Box sx={{ width: "100%", maxWidth: { sm: "100%", md: "1700px" }, p: 2 }}>
      <Typography
        component="h2"
        variant="h6"
        sx={{ mb: 2, fontFamily: "'Public Sans',sans-serif", fontWeight: 700 }}
      >
        Overview
      </Typography>
      <Grid
        container
        spacing={2}
        columns={12}
        sx={{ mb: (theme) => theme.spacing(2) }}
      >
        {statCards.map((card, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <HighlightedCard />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SessionsChart userStats={dashboardData.user_stats} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <PageViewsBarChart pageViewStats={dashboardData.page_view_stats} />
        </Grid>
      </Grid>
      <Typography
        component="h2"
        variant="h6"
        sx={{ mb: 2, fontFamily: "'Public Sans',sans-serif", fontWeight: 700 }}
      >
        Details
      </Typography>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 9 }}>
          <CustomizedDataGrid
            value={{ rows: dashboardData.recent_activity, columns }}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack gap={2} direction={{ xs: "column", sm: "row", lg: "column" }}>
            <ChartUserByCountry userStats={dashboardData.user_stats} />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
