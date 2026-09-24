// import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

export default function HighlightedCard() {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", borderRadius: 3, backgroundColor: "#f5f6fa" }}
      elevation={0}
    >
      <CardContent>
        <InsightsRoundedIcon />
        <Typography
          component="h2"
          variant="subtitle2"
          gutterBottom
          sx={{ fontWeight: "600" }}
        >
          Explore your data
        </Typography>
        <Typography
          sx={{
            color: "text.secondary",
            mb: "8px",
            fontFamily: "'Public Sans',sans-serif",
            fontSize: 15,
          }}
        >
          Uncover performance and visitor insights with our data wizardry.
        </Typography>
        <Button
          variant="contained"
          size="small"
          sx={{
            bgcolor: "#00AB55",
            fontFamily: "'Public Sans',sans-serif",
            textTransform: "none",
          }}
          endIcon={<ChevronRightRoundedIcon />}
          fullWidth={isSmallScreen}
        >
          Get insights
        </Button>
      </CardContent>
    </Card>
  );
}
