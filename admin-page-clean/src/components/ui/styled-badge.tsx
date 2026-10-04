import { Badge, styled } from "@mui/material";

export const StyledBadge = styled(Badge)(({}) => ({
  "& .MuiBadge-badge": {
    right: 4,
    top: 14,
    border: `1px solid black`,
    backgroundColor: "white",
    padding: "0 4px",
    color: "black",
    fontFamily: "'Public Sans', sans-serif",
    fontWeight: 600,
  },
}));
