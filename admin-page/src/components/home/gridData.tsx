import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import { GridCellParams, GridRowsProp, GridColDef } from "@mui/x-data-grid";
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
        backgroundColor: status == "Online" ? "#00AB5514" : "#fff0f0",
        color: status == "Online" ? "green" : "red",
        fontFamily: "'Public Sans',sans-serif",
        fontWeight: 700,
        fontSize: "10px",
      }}
      size="small"
    />
  );
}

export function renderAvatar(
  params: GridCellParams<{ name: string; color: string }, any, any>
) {
  if (params.value == null) {
    return "";
  }

  return (
    <Avatar
      sx={{
        backgroundColor: params.value.color,
        width: "24px",
        height: "24px",
        fontSize: "0.85rem",
      }}
    >
      {params.value.name.toUpperCase().substring(0, 1)}
    </Avatar>
  );
}

export const columns: GridColDef[] = [
  { field: "title", headerName: "Contest", flex: 1.5, minWidth: 200 },
  {
    field: "status",
    headerName: "Status",
    flex: 0.5,
    minWidth: 80,
    renderCell: (params) => renderStatus(params.value as any),
  },
  {
    field: "users",
    headerName: "Users",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 80,
  },
  {
    field: "subject",
    headerName: "Subject",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 100,
  },
  {
    field: "noquestion",
    headerName: "No. Questions",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 120,
  },
  {
    field: "totaltime",
    headerName: "Total time",
    headerAlign: "right",
    align: "right",
    flex: 1,
    minWidth: 100,
  },
  {
    field: "date",
    headerName: "Contest date",
    flex: 1,
    minWidth: 150,
  },
];

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
