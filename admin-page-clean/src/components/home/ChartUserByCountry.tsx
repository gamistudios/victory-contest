import * as React from "react";
import { PieChart } from "@mui/x-charts/PieChart";
import { useDrawingArea } from "@mui/x-charts/hooks";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Search, MapPin } from "lucide-react";
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

// Theme-driven palette (see --chart-* in index.css) so it flips with dark mode.
const RANK_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];
const OTHER_COLOR = "hsl(var(--gray-400))";
const DONUT_SLICES = RANK_COLORS.length; // donut shows top N, rest grouped

interface ChartUserByCountryProps {
  userStats: UserStats;
}

export default function ChartUserByCountry({
  userStats,
}: ChartUserByCountryProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const isNarrowColumn = useMediaQuery(theme.breakpoints.between("sm", "xl"));
  const [query, setQuery] = React.useState("");

  // The donut sizes to its container, so only the radii/margins need a tier.
  const outerRadius = isPhone ? 62 : isNarrowColumn ? 78 : 96;
  const innerRadius = Math.round(outerRadius * 0.75);
  const margin = isPhone ? 6 : 10;

  // Ranked once; 100+ cities stay cheap and the donut never gets 100 slices.
  const ranked = React.useMemo(
    () => [...userStats.by_city].sort((a, b) => b.count - a.count),
    [userStats.by_city]
  );

  const totalUsers = React.useMemo(
    () => ranked.reduce((sum, city) => sum + city.count, 0),
    [ranked]
  );

  const donut = React.useMemo(() => {
    const top = ranked.slice(0, DONUT_SLICES).map((c, i) => ({
      id: c.city,
      label: c.city,
      value: c.count,
      color: RANK_COLORS[i],
    }));
    const rest = ranked.slice(DONUT_SLICES);
    if (rest.length > 0) {
      top.push({
        id: "__other",
        label: `Other (${rest.length})`,
        value: rest.reduce((sum, c) => sum + c.count, 0),
        color: OTHER_COLOR,
      });
    }
    return top;
  }, [ranked]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked
      .map((c, i) => ({ ...c, rank: i + 1 }))
      .filter((c) => !q || c.city.toLowerCase().includes(q));
  }, [ranked, query]);

  const maxPct = ranked[0]?.percentage || 100;

  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        flexGrow: 1,
        borderRadius: 3,
        minWidth: 0,
      }}
    >
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Typography
            component="h2"
            variant="subtitle2"
            sx={{ fontFamily: "'Public Sans',sans-serif", fontWeight: 600 }}
          >
            Users by city
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontWeight: 600 }}
          >
            {ranked.length} {ranked.length === 1 ? "city" : "cities"}
          </Typography>
        </Stack>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minWidth: 0,
            // explicit, fluid height so the chart can measure its container
            height: { xs: "11rem", sm: "13rem", lg: "14rem" },
          }}
        >
          <PieChart
            margin={margin}
            hideLegend
            series={[
              {
                data: donut,
                innerRadius,
                outerRadius,
                paddingAngle: 1,
                highlightScope: { fade: "global", highlight: "item" },
              },
            ]}
            sx={{ width: "100%", height: "100%", fontFamily: "'Public Sans', sans-serif", fontWeight: 700 }}
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

        {/* Search only earns its space once the list is long. */}
        {ranked.length > 8 && (
          <label className="relative block">
            <span className="sr-only">Filter cities</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter cities"
              className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}

        {/* Bounded, independently scrolling list: stays the same height whether
            there are 5 cities or 500. Focusable so keyboard users can scroll. */}
        <Box
          role="list"
          aria-label="Users by city, ranked"
          tabIndex={0}
          className="custom-scrollbar"
          sx={{
            maxHeight: { xs: "15rem", lg: "18rem" },
            overflowY: "auto",
            overscrollBehavior: "contain",
            pr: 0.5,
            borderTop: "1px solid hsl(var(--border))",
            borderBottom: "1px solid hsl(var(--border))",
            "&:focus-visible": {
              outline: "2px solid hsl(var(--ring))",
              outlineOffset: 2,
            },
          }}
        >
          {rows.length === 0 && (
            <Stack
              sx={{ alignItems: "center", gap: 0.5, py: 3, color: "text.secondary" }}
            >
              <MapPin aria-hidden="true" className="h-5 w-5" />
              <Typography variant="body2">No matching cities</Typography>
            </Stack>
          )}
          {rows.map((city) => {
            const color =
              city.rank <= RANK_COLORS.length
                ? RANK_COLORS[city.rank - 1]
                : OTHER_COLOR;
            return (
              <Stack
                role="listitem"
                key={city.city}
                direction="row"
                sx={{ alignItems: "center", gap: 1.5, py: 1 }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    width: "1.75rem",
                    textAlign: "right",
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {city.rank}
                </Typography>
                <Stack sx={{ gap: 0.5, flexGrow: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", gap: 1 }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      title={city.city}
                      sx={{ fontWeight: 500, fontFamily: "'Public Sans',sans-serif" }}
                    >
                      {city.city}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}
                    >
                      {city.count.toLocaleString()} · {city.percentage}%
                    </Typography>
                  </Stack>
                  <Box
                    role="progressbar"
                    aria-label={`${city.city}: ${city.percentage}% of users`}
                    aria-valuenow={city.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "hsl(var(--muted))",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        height: "100%",
                        width: `${Math.max(2, (city.percentage / maxPct) * 100)}%`,
                        borderRadius: 3,
                        backgroundColor: color,
                      }}
                    />
                  </Box>
                </Stack>
              </Stack>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
