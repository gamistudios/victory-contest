import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Contest } from "../../types/models";

interface TimePickerComponentProps {
  timeChangeHandler: (newValue: Dayjs | null) => void;
  value?: Dayjs | null;
  format?: string;
}

export function TimePickerComponent({
  timeChangeHandler,
  value,
}: TimePickerComponentProps) {
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    if (timeValue) {
      const [hours, minutes] = timeValue.split(":");
      const newTime = dayjs().hour(parseInt(hours)).minute(parseInt(minutes));
      timeChangeHandler(newTime);
    } else {
      timeChangeHandler(null);
    }
  };

  const timeValue = value ? value.format("HH:mm") : "";

  return (
    <Input
      type="time"
      value={timeValue}
      onChange={handleTimeChange}
      className="h-12"
    />
  );
}

interface DatePickerDemoProps {
  contest: Contest;
  setContest: React.Dispatch<React.SetStateAction<Contest>>;
}

export function DatePickerDemo({ setContest, contest }: DatePickerDemoProps) {
  return (
    <Popover>
      <PopoverTrigger className="h-[50px]" asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !contest.start_time && "text-muted-foreground"
          )}
        >
          <CalendarIcon />
          {contest.start_time ? (
            (() => {
              try {
                if (!contest.start_time) return "Pick a date";
                const date = new Date(contest.start_time);
                if (isNaN(date.getTime())) return "Invalid date";
                return format(date, "PPP");
              } catch (error) {
                console.warn("Error formatting contest date:", error);
                return "Invalid date";
              }
            })()
          ) : (
            <span>Pick a date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          style={{ fontFamily: "'Public Sans',sans-serif" }}
          mode="single"
          selected={(() => {
            try {
              if (!contest.start_time) return undefined;
              const date = new Date(contest.start_time);
              if (isNaN(date.getTime())) return undefined;
              return date;
            } catch (error) {
              console.warn("Error parsing contest date:", error);
              return undefined;
            }
          })()}
          onSelect={(newValue) => {
            setContest((prev) => ({
              ...prev,
              date: newValue ? newValue.toISOString() : "",
            }));
          }}
          disabled={(date) => date < new Date("1900-01-01")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
