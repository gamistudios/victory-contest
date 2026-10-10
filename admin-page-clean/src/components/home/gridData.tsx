import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import { GridCellParams, GridRowsProp, GridColDef } from "@mui/x-data-grid";
import { RecentContest } from "../../types/dashboard";
// import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

// type SparkLineData = number[];

// function getDaysInMonth(month: number, year: number) {
//   const date = new Date(year, month, 0);
//   const monthName = date.toLocaleDateString("en-US", {
//     month: "short",
//   });
//   const daysInMonth = date.getDate();
//   const days = [];
//   let i = 1;
//   while (days.length < daysInMonth) {
//     days.push(`${monthName} ${i}`);
//     i += 1;
//   }
//   return days;
// }

// function renderSparklineCell(params: GridCellParams<SparkLineData, any>) {
//   const data = getDaysInMonth(4, 2024);
//   const { value, colDef } = params;

//   if (!value || value.length === 0) {
//     return null;
//   }

//   return (
//     <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
//       <SparkLineChart
//         data={value}
//         width={colDef.computedWidth || 100}
//         height={32}
//         plotType="bar"
//         showHighlight
//         showTooltip
//         colors={["hsl(210, 98%, 42%)"]}
//         xAxis={{
//           scaleType: "band",
//           data,
//         }}
//       />
//     </div>
//   );
// }

function renderStatus(status: "Online" | "Offline") {
  return (
    <Chip
      label={status}
      sx={{
        backgroundColor: status == "Online" ? "hsl(var(--brand) / 0.08)" : "hsl(var(--destructive) / 0.1)",
        color: status == "Online" ? "green" : "red",
        fontFamily: "'Public Sans',sans-serif",
        fontWeight: 700,
        // rem so the badge scales with the html font-size step per breakpoint
        fontSize: "0.625rem",
      }}
      size="small"
    />
  );
}

export function renderAvatar(
  params: GridCellParams<RecentContest, { name: string; color: string } | null>
) {
  if (params.value == null) {
    return "";
  }

  return (
    <Avatar
      sx={{
        backgroundColor: params.value.color,
        width: "1.5rem",
        height: "1.5rem",
        fontSize: "0.85rem",
      }}
    >
      {params.value.name.toUpperCase().substring(0, 1)}
    </Avatar>
  );
}

export const columns: GridColDef<RecentContest>[] = [
  { field: "title", headerName: "Contest", flex: 1.5, minWidth: 120 },
  {
    field: "status",
    headerName: "Status",
    flex: 0.7,
    minWidth: 82,
    renderCell: (params) =>
      renderStatus(params.value as RecentContest["status"]),
  },
  {
    field: "users",
    headerName: "Users",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 78,
  },
  {
    field: "subject",
    headerName: "Subject",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 86,
  },
  {
    field: "noquestion",
    headerName: "No. Questions",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 96,
  },
  {
    field: "totaltime",
    headerName: "Total time",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 86,
  },
  {
    field: "date",
    headerName: "Contest date",
    flex: 1,
    minWidth: 96,
  },
];

/**
 * Cohorts of columns that stay readable at each viewport size.
 * The grid never needs more than ~780px when all columns are shown, so narrow
 * screens drop the least important fields instead of squeezing every column.
 */
const columnIdsByScreen = {
  phone: ["title", "status", "date"],
  tablet: ["title", "status", "users", "date"],
  laptop: ["title", "status", "users", "subject", "date"],
  desktop: [
    "title",
    "status",
    "users",
    "subject",
    "noquestion",
    "totaltime",
    "date",
  ],
} as const;

export type HomeGridScreen = keyof typeof columnIdsByScreen;

/**
 * Returns the column set for the current breakpoint, plus compact minimum
 * widths on phones so the visible columns always fill (never overflow) the
 * available grid width.
 */
export function getResponsiveColumns(
  screen: HomeGridScreen
): GridColDef<RecentContest>[] {
  const visibleIds: readonly string[] = columnIdsByScreen[screen];
  const isPhone = screen === "phone";

  return columns
    .filter((column) => visibleIds.includes(column.field))
    .map((column) =>
      isPhone
        ? {
            ...column,
            // 3 columns + the selection cell must fit ~21rem: clamp widths and
            // let the contest name take the leftover space
            minWidth: Math.min(column.minWidth ?? 0, 84),
            flex: column.field === "title" ? 1.8 : 1,
          }
        : column
    );
}

export const rows: GridRowsProp = [
  {
    id: 1,
    contest: "Homepage Overview",
    status: "Online",
    // eventCount: 8345,
    subject: "Math",
    users: 212423,
    noquestion: 50,
    totaltime: "2m 15s",
    date: "11-13-2015",
  },
];
