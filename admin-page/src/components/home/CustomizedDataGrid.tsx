import { DataGrid } from "@mui/x-data-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TrendingUp, Activity } from "lucide-react";

export default function CustomizedDataGrid(params: any) {
  const { rows, columns } = params.value;
  const { onSelectionChange } = params;
  
  return (
    <Card className="w-full rounded-3xl shadow-lg group relative overflow-hidden transition-all duration-500 ease-out hover:scale-[1.01] hover:shadow-2xl">
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl border border-white/30 rounded-3xl" />
      
      {/* Animated Border */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-transparent via-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
              <Table className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Recent Activity
              </h2>
              <p className="text-sm text-slate-500">
                Latest contest and user activities
              </p>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="flex flex-wrap gap-3">
            <Badge className="px-3 py-1 bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {rows?.length || 0} Activities
              </span>
            </Badge>
            <Badge className="px-3 py-1 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Live Updates
              </span>
            </Badge>
          </div>
        </div>
        
        {/* Enhanced DataGrid */}
        <CardContent className="pt-0">
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white/50 backdrop-blur-sm">
            <DataGrid
              autoHeight
              rows={rows}
              columns={columns}
              checkboxSelection
              getRowClassName={(params) =>
                params.indexRelativeToCurrentPage % 2 === 0 
                  ? "even-row hover:bg-blue-50/50 transition-colors duration-200" 
                  : "odd-row hover:bg-blue-50/50 transition-colors duration-200"
              }
              onCellClick={({ row }) => onSelectionChange(row)}
              processRowUpdate={(newRow) => console.log(newRow)}
              initialState={{
                pagination: { paginationModel: { pageSize: 20 } },
              }}
              pageSizeOptions={[10, 20, 50]}
              disableColumnResize
              sx={{ 
                fontFamily: "'Inter', sans-serif", 
                borderRadius: "16px",
                border: "none",
                '& .MuiDataGrid-root': {
                  border: "none",
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: "1px solid #e2e8f0",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: "500",
                },
                '& .MuiDataGrid-columnHeader': {
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  borderBottom: "2px solid #e2e8f0",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#1e293b",
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontWeight: "600",
                },
                '& .MuiDataGrid-row': {
                  transition: "all 0.2s ease",
                  '&:hover': {
                    backgroundColor: "rgba(59, 130, 246, 0.05)",
                    transform: "translateX(4px)",
                  }
                },
                '& .MuiDataGrid-cell:focus': {
                  outline: "none",
                },
                '& .MuiDataGrid-columnHeader:focus': {
                  outline: "none",
                },
                '& .MuiDataGrid-checkboxInput': {
                  color: "#3b82f6",
                },
                '& .MuiDataGrid-pagination': {
                  borderTop: "1px solid #e2e8f0",
                  padding: "16px",
                },
                '& .MuiDataGrid-footerContainer': {
                  backgroundColor: "rgba(59, 130, 246, 0.02)",
                },
                '& .MuiTablePagination-root': {
                  color: "#64748b",
                },
                '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                  fontSize: "14px",
                  fontWeight: "500",
                },
                '& .MuiTablePagination-select': {
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "4px 8px",
                },
                '& .MuiTablePagination-actions': {
                  '& .MuiIconButton-root': {
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    margin: "0 2px",
                    '&:hover': {
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      borderColor: "#3b82f6",
                    }
                  }
                }
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
                  style: { 
                    fontFamily: "'Inter', sans-serif",
                    color: "#64748b"
                  } 
                },
              }}
            />
          </div>
        </CardContent>
      </div>
      
      {/* Hover Effect Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
    </Card>
  );
}
