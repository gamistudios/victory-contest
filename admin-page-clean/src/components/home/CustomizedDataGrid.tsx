import { DataGrid, GridColDef } from "@mui/x-data-grid";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TrendingUp, Activity } from "lucide-react";
import { getResponsiveColumns, HomeGridScreen } from "./gridData";
import { RecentContest } from "../../types/dashboard";

interface CustomizedDataGridProps {
  value: {
    rows: RecentContest[];
    columns: GridColDef<RecentContest>[];
  };
  onSelectionChange?: (row: RecentContest) => void;
}

export default function CustomizedDataGrid({
  value,
  onSelectionChange,
}: CustomizedDataGridProps) {
  const { rows, columns } = value;
  const theme = useTheme();

  // Breakpoint tier: fewer, wider columns as the viewport narrows.
  const isPhone = useMediaQuery(theme.breakpoints.down("sm")); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.down("md")); // < 900px
  const isLaptop = useMediaQuery(theme.breakpoints.down("xl")); // < 1536px
  const screen: HomeGridScreen = isPhone
    ? "phone"
    : isTablet
    ? "tablet"
    : isLaptop
    ? "laptop"
    : "desktop";

  // The caller-provided column set stays the source of truth; `getResponsiveColumns`
  // only trims it for narrow viewports when the default set cannot fit.
  const responsiveColumns = getResponsiveColumns(screen);
  const allowedFields = responsiveColumns.map((column) => column.field);
  const visibleColumns = columns
    .filter((column) => allowedFields.includes(column.field))
    .map((column) => {
      const compact = responsiveColumns.find(
        (candidate) => candidate.field === column.field
      );
      return screen === "phone" && compact
        ? { ...column, minWidth: compact.minWidth, flex: compact.flex }
        : column;
    });

  return (
    <Card className="w-full min-w-0 rounded-2xl shadow-lg group relative overflow-hidden transition-shadow duration-500 ease-out sm:rounded-3xl hover:shadow-2xl">
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl border border-white/30 rounded-2xl sm:rounded-3xl" />

      {/* Animated Border */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 sm:rounded-3xl" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="p-4 pb-3 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shrink-0">
              <Table className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 truncate">
                Recent Activity
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Latest contest and user activities
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Badge className="px-2.5 py-1 sm:px-3 bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {rows?.length || 0} Activities
              </span>
            </Badge>
            <Badge className="px-2.5 py-1 sm:px-3 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Live Updates
              </span>
            </Badge>
          </div>
        </div>

        {/* Enhanced DataGrid */}
        <CardContent className="pt-0 px-2 pb-2 sm:px-6 sm:pb-6">
          <div className="w-full min-w-0 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 bg-white/50 backdrop-blur-sm">
            <DataGrid
              autoHeight
              density={isPhone ? "compact" : "standard"}
              rows={rows}
              columns={visibleColumns}
              checkboxSelection
              getRowClassName={(params) =>
                params.indexRelativeToCurrentPage % 2 === 0
                  ? "even-row hover:bg-blue-50/50 transition-colors duration-200"
                  : "odd-row hover:bg-blue-50/50 transition-colors duration-200"
              }
              onCellClick={({ row }) => onSelectionChange?.(row)}
              processRowUpdate={(newRow) => {
                console.log(newRow);
                return newRow;
              }}
              initialState={{
                pagination: { paginationModel: { pageSize: 20 } },
              }}
              pageSizeOptions={[10, 20, 50]}
              disableColumnResize
              sx={{
                width: "100%",
                fontFamily: "'Inter', sans-serif",
                borderRadius: "1rem",
                border: "none",
                "& .MuiDataGrid-cell": {
                  borderBottom: "1px solid #e2e8f0",
                  padding: isPhone ? "0.25rem 0.375rem" : "0.5rem 1rem",
                  fontSize: isPhone ? "0.75rem" : "0.875rem",
                  fontWeight: "500",
                },
                "& .MuiDataGrid-columnHeader": {
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  borderBottom: "2px solid #e2e8f0",
                  padding: isPhone ? "0.25rem 0.375rem" : "0.5rem 1rem",
                  fontSize: isPhone ? "0.75rem" : "0.875rem",
                  fontWeight: "600",
                  color: "#1e293b",
                },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontWeight: "600",
                  lineHeight: isPhone ? "1.1rem" : "1.25rem",
                },
                "& .MuiDataGrid-row": {
                  transition: "background-color 0.2s ease",
                  "&:hover": {
                    backgroundColor: "rgba(59, 130, 246, 0.05)",
                  },
                },
                "& .MuiDataGrid-cell:focus": {
                  outline: "none",
                },
                "& .MuiDataGrid-columnHeader:focus": {
                  outline: "none",
                },
                "& .MuiDataGrid-checkboxInput": {
                  color: "#3b82f6",
                },
                "& .MuiDataGrid-pagination": {
                  borderTop: "1px solid #e2e8f0",
                  padding: isPhone ? "0.25rem 0.5rem" : "0.5rem 1rem",
                  flexWrap: "wrap",
                  gap: "0.25rem",
                },
                "& .MuiDataGrid-footerContainer": {
                  backgroundColor: "rgba(59, 130, 246, 0.02)",
                  flexWrap: "wrap",
                },
                "& .MuiTablePagination-root": {
                  color: "#64748b",
                  flexWrap: "wrap",
                },
                // "rows per page" picker costs ~9rem of footer width: drop it on phones
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-input":
                  {
                    display: isPhone ? "none" : undefined,
                  },
                "& .MuiTablePagination-displayedRows": {
                  fontSize: isPhone ? "0.6875rem" : "0.875rem",
                  fontWeight: "500",
                  whiteSpace: "nowrap",
                },
                "& .MuiTablePagination-select": {
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                  padding: "0.25rem 0.5rem",
                  fontSize: isPhone ? "0.6875rem" : "0.875rem",
                },
                "& .MuiTablePagination-actions": {
                  "& .MuiIconButton-root": {
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.5rem",
                    margin: "0 2px",
                    "&:hover": {
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      borderColor: "#3b82f6",
                    },
                  },
                },
              }}
              slotProps={{
                filterPanel: {
                  filterFormProps: {
                    logicOperatorInputProps: {
                      variant: "outlined",
                      size: "small",
                    },
                    columnInputProps: {
                      variant: "outlined",
                      size: "small",
                      sx: { mt: "auto" },
                    },
                    operatorInputProps: {
                      variant: "outlined",
                      size: "small",
                      sx: { mt: "auto" },
                    },
                    valueInputProps: {
                      InputComponentProps: {
                        variant: "outlined",
                        size: "small",
                      },
                    },
                  },
                },
                pagination: {
                  rowsPerPageOptions: isPhone ? [10, 20] : [10, 20, 50],
                  labelDisplayedRows: (
                    { from, to, count }: { from: number; to: number; count: number }
                  ) =>
                    isPhone
                      ? `${from}-${to}/${count}`
                      : `${from}-${to} of ${count}`,
                  style: {
                    fontFamily: "'Inter', sans-serif",
                    color: "#64748b",
                  },
                },
              }}
            />
          </div>
        </CardContent>
      </div>

      {/* Hover Effect Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl sm:rounded-3xl" />
    </Card>
  );
}
