import * as React from "react";
import { PieChart } from "@mui/x-charts/PieChart";
import { useDrawingArea } from "@mui/x-charts/hooks";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import LinearProgress, {
  linearProgressClasses,
} from "@mui/material/LinearProgress";
import { UserStats } from "../../types/dashboard";

interface StyledTextProps {
  variant: "primary" | "secondary";
}

const StyledText = styled("text", {
  shouldForwardProp: (prop) => prop !== "variant",
})<StyledTextProps>(({ theme }) => ({
  textAnchor: "middle",
  dominantBaseline: "central",
  fill: theme.palette.text.secondary,
  variants: [
    {
      props: {
        variant: "primary",
      },
      style: {
        fontSize: theme.typography.h5.fontSize,
      },
    },
    {
      props: ({ variant }) => variant !== "primary",
      style: {
        fontSize: theme.typography.body2.fontSize,
      },
    },
    {
      props: {
        variant: "primary",
      },
      style: {
        fontWeight: theme.typography.h5.fontWeight,
      },
    },
    {
      props: ({ variant }) => variant !== "primary",
      style: {
        fontWeight: theme.typography.body2.fontWeight,
      },
    },
  ],
}));

interface PieCenterLabelProps {
  primaryText: string;
  secondaryText: string;
}

function PieCenterLabel({ primaryText, secondaryText }: PieCenterLabelProps) {
  const { width, height, left, top } = useDrawingArea();
  const primaryY = top + height / 2 - 10;
  const secondaryY = primaryY + 24;

  return (
    <React.Fragment>
      <StyledText variant="primary" x={left + width / 2} y={primaryY}>
        {primaryText}
      </StyledText>
      <StyledText variant="secondary" x={left + width / 2} y={secondaryY}>
        {secondaryText}
      </StyledText>
    </React.Fragment>
  );
}

const colors = [
  "hsl(220, 20%, 65%)",
  "hsl(220, 20%, 42%)",
  "hsl(220, 20%, 35%)",
  "hsl(220, 20%, 25%)",
];

interface ChartUserByCountryProps {
  userStats: UserStats;
}

export default function ChartUserByCountry({
  userStats,
}: ChartUserByCountryProps) {
  // Transform city data for the pie chart
  const data = userStats.by_city.map((city) => ({
    label: city.city,
    value: city.count,
  }));

  // Transform city data for the progress bars
  const cities = userStats.by_city.map((city, index) => ({
    name: city.city,
    value: city.percentage,
    color: colors[index % colors.length],
  }));

  // Calculate total users
  const totalUsers = userStats.by_city.reduce(
    (sum, city) => sum + city.count,
    0
  );

  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        flexGrow: 1,
        borderRadius: 3,
      }}
    >
      <CardContent>
        <Typography
          component="h2"
          variant="subtitle2"
          sx={{ fontFamily: "'Public Sans',sans-serif", fontWeight: 600 }}
        >
          Users by city
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <PieChart
            colors={colors}
            margin={{
              left: 80,
              right: 80,
              top: 80,
              bottom: 80,
            }}
            hideLegend
            series={[
              {
                data,
                innerRadius: 75,
                outerRadius: 100,
                paddingAngle: 0,
                highlightScope: { fade: "global", highlight: "item" },
              },
            ]}
            height={260}
            width={260}
            sx={{ fontFamily: "'Public Sans', sans-serif", fontWeight: 700 }}
          >
            <PieCenterLabel
              primaryText={
                totalUsers >= 1000
                  ? `${(totalUsers / 1000).toFixed(1)}K`
                  : totalUsers.toString()
              }
              secondaryText="Total"
            />
          </PieChart>
        </Box>
        {cities.map((city, index) => (
          <Stack
            key={index}
            direction="row"
            sx={{ alignItems: "center", gap: 2, pb: 2 }}
          >
            <Stack sx={{ gap: 1, flexGrow: 1 }}>
              <Stack
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: "500",
                    fontFamily: "'Public Sans',san-serif",
                  }}
                >
                  {city.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    fontFamily: "'Public Sans',san-serif",
                  }}
                >
                  {city.value}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                aria-label="Number of users by country"
                value={city.value}
                sx={{
                  [`& .${linearProgressClasses.bar}`]: {
                    backgroundColor: city.color,
                  },
                }}
              />
            </Stack>
          </Stack>
        ))}
      </CardContent>
    </Card>
  );
}
