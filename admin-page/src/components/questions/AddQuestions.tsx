import { Box, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";

import { useSearchParams } from "react-router-dom";
import {
  AddQuestionManual,
  EnhancedUploadQuestions,
} from "./AddQuestionMethod";

export default function AddQuestions() {
  const [searchParams] = useSearchParams();
  const isEdit = searchParams.get("edit");

  const [tabValue, setTabValue] = useState(0);

  const questionString = searchParams.get("question");
  console.log(questionString);
  return (
    <Box sx={{ padding: 2 }}>
      <Box sx={{ mb: 5 }}>
        <Typography
          sx={{
            fontFamily: "'Public Sans',sans-serif",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {isEdit ? "Edit the question you chose" : "Add Question"}
        </Typography>
      </Box>
      <Box>
        <Tabs
          value={tabValue}
          aria-label="basic tabs example"
          sx={{
            "& .MuiTabs-indicator": {
              backgroundColor: "#00AB55",
            },
            borderBottom: "none",
          }}
          // variant="fullWidth"
          onChange={(_e, newValue) => setTabValue(newValue)}
        >
          <Tab
            sx={{
              "&.MuiTab-root": {
                fontFamily: "'Public Sans',sans-serif",
                textTransform: "none",
                fontWeight: 600,
              },
              padding: 0,
              mr: 4,
              "&.Mui-selected": {
                color: "black",
              },
            }}
            label="Add Question Manually"
          />
          <Tab
            sx={{
              "&.MuiTab-root": {
                fontFamily: "'Public Sans',sans-serif",
                textTransform: "none",
                fontWeight: 600,
              },
              "&.Mui-selected": {
                color: "black",
              },
            }}
            label="Upload Question"
            {...a11yProps(1)}
          />
        </Tabs>
      </Box>
      <CustomTabPanel value={tabValue} index={0}>
        <AddQuestionManual />
      </CustomTabPanel>
      <CustomTabPanel value={tabValue} index={1}>
        <EnhancedUploadQuestions />
      </CustomTabPanel>
    </Box>
  );
}
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 4 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}
