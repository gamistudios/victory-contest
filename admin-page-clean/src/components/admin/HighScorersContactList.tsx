import { Trophy, Trash2 } from "lucide-react";
import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Avatar,
  LinearProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { Phone, Star, TrendingUp, Delete } from "@mui/icons-material";
import api from "@/services/api";
import { feedbackServices, describeApiError } from "../../services/feedbackServices";

interface HighScorer {
  id: string;
  name: string;
  phoneNumber: string;
  score: number;
  submittedAt: string;
  language: string;
}

// Raw shape of a feedback response as returned by the backend (domain JSON tags).
interface RawFeedbackResponse {
  id: string;
  student_name: string;
  submitted_at: string;
  contact_info?: {
    score: number;
    phone_number: string;
    language: string;
  };
}

export default function HighScorersContactList() {
  const [highScorers, setHighScorers] = useState<HighScorer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scorerToDelete, setScorerToDelete] = useState<HighScorer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // All requests go through the shared `api` axios instance (relative paths,
  // admin token cookie attached).

  useEffect(() => {
    fetchHighScorers();
  }, []);

  const fetchHighScorers = async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/feedback-response/");

      const highScorersData = response.data.responses
        .filter((item: RawFeedbackResponse) => {
          const contactInfo = item.contact_info;
          return (
            contactInfo && contactInfo.score >= 500 && contactInfo.score <= 600
          );
        })
        .map((item: RawFeedbackResponse) => ({
          id: item.id,
          name: item.student_name,
          phoneNumber: item.contact_info?.phone_number ?? "",
          score: item.contact_info?.score ?? 0,
          submittedAt: item.submitted_at,
          language: item.contact_info?.language ?? "",
        }))
        .sort((a: HighScorer, b: HighScorer) => b.score - a.score);

      setHighScorers(highScorersData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching high scorers:", error);
      setError(
        describeApiError(error, "Failed to fetch high scorers data")
      );
      setLoading(false);
    }
  };

  const handleDeleteClick = (scorer: HighScorer) => {
    setScorerToDelete(scorer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!scorerToDelete) return;

    try {
      setDeleting(true);
      // Use the feedback service to delete only the contact information
      await feedbackServices.deleteContact(scorerToDelete.phoneNumber);

      // Remove the deleted scorer from the list
      setHighScorers((prev) =>
        prev.filter((scorer) => scorer.id !== scorerToDelete.id)
      );

      setDeleteDialogOpen(false);
      setScorerToDelete(null);
    } catch (error) {
      console.error("Error deleting contact:", error);
      setError(describeApiError(error, "Failed to delete contact"));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setScorerToDelete(null);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getScoreColor = (score: number): "success" | "warning" | "primary" => {
    if (score >= 580) return "success";
    if (score >= 550) return "warning";
    return "primary";
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Loading high scorers...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 3,
          color: "hsl(var(--info))",
          fontSize: { xs: "1.25rem", sm: "2.125rem" },
        }}
      >
        <Trophy className="mr-2 inline h-6 w-6 align-text-bottom" aria-hidden="true" />
        High Scorers Contact List (500-600 Range)
      </Typography>

      <div className="flex flex-wrap gap-3 mb-3">
        <div className="w-full sm:w-1/2 md:w-1/4">
          <Card
            sx={{
              background: "linear-gradient(135deg, hsl(var(--indigo-fix-500)) 0%, hsl(var(--purple-fix-700)) 100%)",
              color: "hsl(0 0% 100%)",
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {highScorers.length}
                  </Typography>
                  <Typography variant="body2">Total High Scorers</Typography>
                </Box>
                <TrendingUp sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </div>

        <div className="w-full sm:w-1/2 md:w-1/4">
          <Card
            sx={{
              background: "linear-gradient(135deg, hsl(var(--fuchsia-fix-400)) 0%, hsl(var(--rose-fix-500)) 100%)",
              color: "hsl(0 0% 100%)",
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {highScorers.filter((s) => s.score >= 550).length}
                  </Typography>
                  <Typography variant="body2">Excellent (550+)</Typography>
                </Box>
                <Star sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </div>
      </div>

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "hsl(var(--muted))" }}>
                <TableCell sx={{ fontWeight: 600, minWidth: 160 }}>
                  Student Name
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Score</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Phone Number</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Submitted Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Language</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {highScorers
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((scorer) => (
                  <TableRow
                    key={scorer.id}
                    sx={{ "&:hover": { backgroundColor: "hsl(var(--muted))" } }}
                  >
                    <TableCell>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <Avatar
                          sx={{
                            bgcolor:
                              getScoreColor(scorer.score) === "success"
                                ? "hsl(var(--success))"
                                : "hsl(var(--info))",
                          }}
                        >
                          {scorer.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </Avatar>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 600 }}
                        >
                          {scorer.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${scorer.score} pts`}
                        color={getScoreColor(scorer.score)}
                        variant="filled"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Phone sx={{ fontSize: 16, color: "text.secondary" }} />
                        <Typography
                          variant="body1"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {scorer.phoneNumber}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        try {
                          if (!scorer.submittedAt) return "N/A";
                          const date = new Date(scorer.submittedAt);
                          if (isNaN(date.getTime())) return "Invalid date";
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        } catch (error) {
                          console.warn(
                            "Error formatting submittedAt date:",
                            error
                          );
                          return "N/A";
                        }
                      })()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          scorer.language === "amharic" ? "Amharic" : "English"
                        }
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() => handleDeleteClick(scorer)}
                        color="error"
                        title="Delete this contact"
                        sx={{
                          p: 1.5,
                          "&:hover": {
                            backgroundColor: "hsl(var(--destructive) / 0.1)",
                          },
                        }}
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={highScorers.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {highScorers.length === 0 && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" sx={{ color: "text.secondary" }}>
            No high scorers found in the 500-600 range
          </Typography>
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "error.main" }}>
          <Trash2 className="mr-2 inline h-5 w-5 align-text-bottom" aria-hidden="true" />
          Delete Contact Information
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete the contact information for{" "}
            <strong>{scorerToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This will permanently remove their contact information (phone number
            and score) from the high scorers list. Their feedback response will
            remain intact. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={
              deleting ? (
                <LinearProgress sx={{ width: 16, height: 16 }} />
              ) : (
                <Delete />
              )
            }
          >
            {deleting ? "Deleting..." : "Delete Contact Info"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
