"use client";

import * as React from "react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { CalendarIcon } from "lucide-react";

// Local imports (assuming these are your custom components/types)
import { addContest } from "@/services/contestServices";
import Questions from "./Questions";
import { type Question, type Contest, APIContest } from "../../types/models";
import { grades, Subjects } from "../questions/Data"; // Your constants
import { cn } from "@/lib/utils"; // From shadcn/ui

// Shadcn/ui Components
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Define action types for the reducer
type Action =
  | { type: "UPDATE_FIELD"; field: keyof Contest; value: any }
  | {
      type: "SET_TIME";
      field: "start_time" | "end_time";
      value: dayjs.Dayjs | null;
    }
  | { type: "RESET_FORM" };

// Reducer function to manage contest state
const contestReducer = (state: Contest, action: Action): Contest => {
  switch (action.type) {
    case "UPDATE_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_TIME":
      if (!state.start_time || !action.value) {
        toast.error("Please select a date first.");
        return state;
      }
      const combinedDateTime = dayjs(state.start_time)
        .hour(action.value.hour())
        .minute(action.value.minute())
        .second(action.value.second());
      return {
        ...state,
        [action.field]: combinedDateTime.format("YYYY-MM-DDTHH:mm:ss"),
      };
    case "RESET_FORM":
      return initialState;
    default:
      return state;
  }
};

const initialState: Contest = {
  title: "",
  description: "",
  questions: [],
  start_time: "",
  end_time: "",
  grade: "",
  subject: "",

  prize: "",
  type: "free",
  status: "inactive",
};

export default function AddContest() {
  const [contest, dispatch] = React.useReducer(contestReducer, initialState);
  const [selectedQuestions, setSelectedQuestions] = React.useState<Question[]>(
    []
  );
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleContestChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    dispatch({
      type: "UPDATE_FIELD",
      field: e.target.id as keyof Contest,
      value: e.target.value,
    });
  };

  const handleSelectChange = (field: keyof Contest, value: string) => {
    dispatch({ type: "UPDATE_FIELD", field, value });
  };

  // Handler for DatePicker

  // Handler for question selection
  const handleSelectionChange = (selectedQuestions: Question[]) => {
    setSelectedQuestions(selectedQuestions);
  };
  const handleTimeChange = (
    field: "start_time" | "end_time",
    timeValue: string
  ) => {
    if (!selectedDate) {
      toast.error("Please select a date first.");
      return;
    }
    // Combine the selected date with the new time
    const combinedDateTime = dayjs(`${selectedDate}T${timeValue}`).format(
      "YYYY-MM-DDTHH:mm:ss"
    );

    // Dispatch a simple UPDATE_FIELD action with the final value
    dispatch({
      type: "UPDATE_FIELD",
      field: field,
      value: combinedDateTime,
    });
  };

  // Submission handler
  const handleSubmitContest = async () => {
    if (
      !contest.title ||
      !contest.grade ||
      !contest.subject ||
      selectedQuestions.length === 0
    ) {
      toast.error(
        "Please fill in all required fields: Title, Grade, Subject, and select at least one question."
      );
      return;
    }

    const contestData: APIContest = {
      ...contest,
      questions: selectedQuestions.map((q) => q.id!),
    };

    setIsLoading(true);
    const promise = addContest(contestData);

    toast.promise(promise, {
      loading: "Submitting contest...",
      success: () => {
        dispatch({ type: "RESET_FORM" });
        setSelectedQuestions([]);
        setIsLoading(false);
        return "Contest added successfully! 🎉";
      },
      error: (err) => {
        setIsLoading(false);
        return `Failed to add contest: ${err.message}`;
      },
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Add New Contest</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form Fields */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Contest Details</CardTitle>
              <CardDescription>
                Provide the main information for your contest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Contest Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Weekly Algebra Challenge"
                  value={contest.title}
                  onChange={handleContestChange}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the rules, topics, and goals of the contest."
                  value={contest.description}
                  onChange={handleContestChange}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prize">Prize</Label>
                <Input
                  id="prize"
                  placeholder="e.g., $100 Amazon Gift Card, Gold Medal"
                  value={contest.prize}
                  onChange={handleContestChange}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Assuming `Questions` is a component that renders a selectable list */}
          <Questions onSelectionChange={handleSelectionChange} />
        </div>

        {/* Right Column: Metadata and Scheduling */}
        <div className="lg:col-span-1 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select
                  onValueChange={(value) =>
                    handleSelectChange("subject", value)
                  }
                  value={contest.subject}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {Subjects.map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Grade</Label>
                <Select
                  onValueChange={(value) => handleSelectChange("grade", value)}
                  value={contest.grade}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {`Grade ${grade}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Contest Type</Label>
                <Select
                  onValueChange={(value) =>
                    handleSelectChange("type", value as "free" | "premium")
                  }
                  value={contest.type}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>
                Set the date and time for the contest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                      disabled={isLoading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? (
                        dayjs(selectedDate).format("MMMM D, YYYY")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={(() => {
                        try {
                          if (selectedDate === null) return undefined;
                          const date = new Date(selectedDate);
                          if (isNaN(date.getTime())) return undefined;
                          return date;
                        } catch (error) {
                          console.warn("Error parsing contest date:", error);
                          return undefined;
                        }
                      })()}
                      initialFocus
                      onSelect={(date) =>
                        setSelectedDate(dayjs(date).format("YYYY-MM-DD"))
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Start Time</Label>
                {/* Assuming TimePickerComponent is adapted or you use a shadcn-compatible one */}
                {/* <TimePickerComponent ... /> */}
                <Input
                  type="time"
                  id="start_time_picker"
                  value={
                    contest.start_time
                      ? dayjs(contest.start_time).format("HH:mm")
                      : ""
                  }
                  onChange={(e) =>
                    handleTimeChange("start_time", e.target.value)
                  }
                  disabled={isLoading || !selectedDate}
                />
              </div>

              <div className="space-y-2">
                <Label>End Time</Label>
                {/* <TimePickerComponent ... /> */}
                <Input
                  type="time"
                  id="end_time_picker"
                  value={
                    contest.end_time
                      ? dayjs(contest.end_time).format("HH:mm")
                      : ""
                  }
                  onChange={(e) => handleTimeChange("end_time", e.target.value)} // Use the new handler
                  disabled={isLoading || !selectedDate}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSubmitContest}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Submitting..." : "Add Contest"}
          </Button>
        </div>
      </div>
    </div>
  );
}
