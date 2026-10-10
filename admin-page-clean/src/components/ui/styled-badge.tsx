import { Badge, styled } from "@mui/material";

export const StyledBadge = styled(Badge)(({}) => ({
  "& .MuiBadge-badge": {
    right: 4,
    top: 14,
    border: `1px solid hsl(var(--border))`,
    backgroundColor: "hsl(var(--card))",
    padding: "0 4px",
    color: "hsl(var(--card-foreground))",
    fontFamily: "'Public Sans', sans-serif",
    fontWeight: 600,
  },
}));
