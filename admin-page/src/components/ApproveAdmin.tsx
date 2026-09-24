import {
  Box,
  IconButton,
  InputAdornment,
  Paper,
  TableBody,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Avatar,
} from "@mui/material";
import React, { useEffect, useState } from "react";

import TableCell, { tableCellClasses } from "@mui/material/TableCell";
import { styled } from "@mui/material/styles";
import Eror, { Loading } from "@/components/common/Stauts";
import { Admin } from "@/types/models";
import { approveAdmin, getAllAdmins } from "@/lib/utils";

const headers = ["Name", "Email", "Status"];

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.common.black,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
  },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  "&:nth-of-type(even)": {
    backgroundColor: theme.palette.action.hover,
  },
  "&:last-child td, &:last-child th": {
    border: 0,
  },
}));

// Primary action: no `.tight`-style shrink — keep a 44px touch target on
// coarse pointers while staying compact on desktop.
const ApproveButton = styled("button")(({ theme }) => ({
  fontFamily: "'Public Sans', sans-serif",
  fontSize: "0.875rem",
  fontWeight: 600,
  color: theme.palette.common.white,
  backgroundColor: theme.palette.primary.main,
  border: "none",
  borderRadius: 8,
  padding: theme.spacing(1, 2),
  minHeight: 44,
  minWidth: 44,
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
}));

export default function ApproveAdmin() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");

  const fetchAdmins = async () => {
    try {
      const response = await getAllAdmins();
      // getAllAdmins() already unwraps the {admins:[...]} envelope from
      // GET /api/admin/; every row carries its backend `id`.
      const fetchedAdmins: Admin[] = response || [];

      setAdmins(fetchedAdmins);
      setStatus("success");
    } catch (error) {
      console.error("Failed to fetch admins:", error);
      setStatus("error");
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAdminApproval = async (id: string, isApproved: boolean) => {
    if (!id) {
      console.error("Admin row without an id cannot be approved");
      return;
    }
    try {
      await approveAdmin(id, { is_approved: isApproved });
      setAdmins((prevAdmins) =>
        prevAdmins.map((admin) =>
          admin.id === id ? { ...admin, is_approved: isApproved } : admin
        )
      );
    } catch (error) {
      console.error("Failed to approve admin:", error);
    }
  };

  const filteredAdmins = admins.filter(
    (admin) =>
      admin.name.toLowerCase().includes(search.toLowerCase()) ||
      (admin.email && admin.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", p: { xs: 2, sm: 3 } }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: '"Public Sans", sans-serif',
            fontSize: { xs: 20, sm: 25 },
            fontWeight: 700,
            mb: 1,
          }}
        >
          Admins
        </Typography>
        <Typography
          sx={{
            fontSize: "0.875rem",
            color: "rgb(145, 158, 171)",
            fontFamily: '"Public Sans", sans-serif',
          }}
        >
          All
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          width: "100%",
          mt: 3,
        }}
      >
        <TextField
          label=""
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          id="outlined-start-adornment"
          sx={{
            width: { xs: "100%", sm: "25ch" },
            maxWidth: "100%",
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              "&.Mui-focused fieldset": {
                border: "1px solid gray",
              },
            },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                      role="img"
                      width="0.7em"
                      height="0.7em"
                      preserveAspectRatio="xMidYMid meet"
                      viewBox="0 0 24 24"
                      style={{ fill: "currentColor" }}
                    >
                      <path
                        fill="currentColor"
                        d="M20.71 19.29l-3.4-3.39A7.92 7.92 0 0 0 19 11a8 8 0 1 0-8 8a7.92 7.92 0 0 0 4.9-1.69l3.39 3.4a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42M5 11a6 6 0 1 1 6 6a6 6 0 0 1-6-6"
                      />
                    </svg>
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          inputProps={{
            style: { fontFamily: '"Public Sans",sans-serif' },
          }}
        />
      </Box>
      <TableContainer
        elevation={0}
        component={Paper}
        sx={{
          flex: 1,
          borderRadius: 3,
          width: "100%",
        }}
      >
        {status === "success" ? (
          <Table>
            <TableHead>
              <TableRow>
                {headers.map((header, index) => (
                  <StyledTableCell
                    key={index}
                    sx={{
                      fontFamily: "'Public Sans',sans-serif",
                      fontSize: "0.9rem",
                      // Email is the widest column and the least useful at a
                      // glance; hiding it below sm keeps the table inside the
                      // viewport instead of forcing a horizontal scroll.
                      ...(header === "Email" && {
                        display: { xs: "none", sm: "table-cell" },
                      }),
                    }}
                    align={header === "Name" ? "left" : "right"}
                  >
                    {header}
                  </StyledTableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAdmins.map((row, index) => (
                <Row
                  key={row.id ?? index}
                  student={row}
                  onApprove={handleAdminApproval}
                />
              ))}
            </TableBody>
          </Table>
        ) : status === "pending" ? (
          <Loading />
        ) : (
          <Eror />
        )}
      </TableContainer>
    </Box>
  );
}

interface RowProps {
  student: Admin;
  onApprove: (id: string, isApproved: boolean) => void;
}

function Row({ student, onApprove }: RowProps) {
  const handleApprove = async () => {
    // Approve by the admin's backend id (DynamoDB primary key), not email —
    // PUT /api/admin/:id read-modify-writes the row keyed by that id.
    await onApprove(student.id ?? "", true);
  };

  return (
    <React.Fragment>
      <StyledTableRow
        sx={{
          cursor: "pointer",
          "&:hover": { backgroundColor: "#f7f7f5" },
        }}
      >
        <StyledTableCell align="right">
          <Box
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: { xs: 2, sm: 4, md: 6 },
              minWidth: 0,
            }}
          >
            <IconButton aria-label="expand row" size="small" sx={{ flexShrink: 0 }}>
              <Avatar src={student.imgurl} />
            </IconButton>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "'Public Sans',sans-serif",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {student.name}
              </Typography>
              {/* The Email column is hidden below sm, so put the address under
                  the name instead — the row stays identifiable without a
                  horizontal scroll. */}
              <Typography
                sx={{
                  display: { xs: "block", sm: "none" },
                  fontFamily: "'Public Sans',sans-serif",
                  fontSize: "0.75rem",
                  color: "rgb(145, 158, 171)",
                  overflowWrap: "anywhere",
                }}
              >
                {student.email}
              </Typography>
            </Box>
          </Box>
        </StyledTableCell>
        <StyledTableCell
          align="right"
          sx={{ display: { xs: "none", sm: "table-cell" } }}
        >
          <Box component="p" sx={{ overflowWrap: "anywhere" }}>
            {student.email}
          </Box>
        </StyledTableCell>
        <StyledTableCell
          sx={{ fontFamily: "'Public Sans',sans-serif" }}
          align="right"
        >
          {student.is_approved ? (
            "Approved"
          ) : (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <ApproveButton onClick={handleApprove}>Not approved</ApproveButton>
            </Box>
          )}
        </StyledTableCell>
      </StyledTableRow>
    </React.Fragment>
  );
}
