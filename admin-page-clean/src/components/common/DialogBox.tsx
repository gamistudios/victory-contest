// src/components/common/DialogBox.tsx
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerComponent } from "../contests/DatePicker"; // Corrected import path for TimePickerComponent
import dayjs from "dayjs";
import { Contest } from "../../types/models"; // Assuming Contest type path is correct

interface DialogBoxProps {
  open: boolean; // Controlled by parent
  onClose: () => void; // Controlled by parent
  action: "announce" | "clone" | "update";
  handler: (
    action: string,
    time?: { start_time: string; end_time: string },
    info?: { title: string; description: string },
    data?: { file: File | null; message: string }
  ) => Promise<void>;
  contest?: Contest; // Only for 'update' action, provides initial values
}

export const DialogBox: React.FC<DialogBoxProps> = ({
  open,
  onClose,
  action,
  handler,
  contest,
}) => {
  const [startTime, setStartTime] = useState<dayjs.Dayjs | null>(null);
  const [endTime, setEndTime] = useState<dayjs.Dayjs | null>(null);
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneDescription, setCloneDescription] = useState("");
  const [announceMessage, setAnnounceMessage] = useState("");

  // Initialize time states when dialog opens or contest prop changes
  useEffect(() => {
    if (open && action === "update" && contest) {
      const parseTime = (timeStr: string) => {
        if (!timeStr) return null; // Handle empty or undefined time strings gracefully
        let parsed = dayjs(timeStr, "HH:mm");
        if (!parsed.isValid()) {
          parsed = dayjs(timeStr, "hh:mm A");
        }
        return parsed.isValid() ? parsed : null;
      };

      const parsedStartTime = contest.start_time
        ? parseTime(contest.start_time)
        : null;
      const parsedEndTime = contest.end_time
        ? parseTime(contest.end_time)
        : null;

      setStartTime(parsedStartTime);
      setEndTime(parsedEndTime);
    }

    // Initialize announce message when dialog opens
    if (open && action === "announce") {
      setAnnounceMessage(
        "🎉 New contest announced! Check it out and register now!"
      );
    }
  }, [open, action, contest]);

  const handleSubmit = async () => {
    const today = dayjs().format("YYYY-MM-DD");
    if (action === "announce") {
      await handler(action, undefined, undefined, {
        file: null,
        message: announceMessage || "Contest announced!",
      });
    } else if (action === "clone") {
      await handler(action, undefined, {
        title: cloneTitle,
        description: cloneDescription,
      });
    } else if (action === "update") {
      await handler(action, {
        start_time: startTime ? `${today}T${startTime.format("HH:mm")}:00` : "",
        end_time: endTime ? `${today}T${endTime.format("HH:mm")}:00` : "",
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {action === "announce" && "Announce Contest"}
            {action === "clone" && "Clone Contest"}
            {action === "update" && "Update Contest Time"}
          </DialogTitle>
          <DialogDescription>
            {action === "announce" &&
              "Announce this contest to all participants"}
            {action === "clone" &&
              "Create a copy of this contest with new details"}
            {action === "update" && "Update the contest start and end times"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {action === "announce" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="announceMessage">Announcement Message</Label>
                <Textarea
                  id="announceMessage"
                  value={announceMessage}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setAnnounceMessage(e.target.value)
                  }
                  placeholder="Enter your announcement message (e.g., 'New contest starting soon!', 'Don't miss this opportunity!')"
                  rows={4}
                />
                <p className="text-xs text-gray-500">
                  This message will be sent to all students along with contest
                  details.
                </p>
              </div>
            </>
          )}
          {action === "clone" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">New Contest Title</Label>
                <Input
                  id="title"
                  value={cloneTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCloneTitle(e.target.value)
                  }
                  placeholder="Enter contest title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">New Contest Description</Label>
                <Textarea
                  id="description"
                  value={cloneDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCloneDescription(e.target.value)
                  }
                  placeholder="Enter contest description"
                  rows={4}
                />
              </div>
            </>
          )}
          {action === "update" && (
            <>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimePickerComponent
                  timeChangeHandler={(newValue: dayjs.Dayjs | null) =>
                    setStartTime(newValue)
                  }
                  value={startTime}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimePickerComponent
                  timeChangeHandler={(newValue: dayjs.Dayjs | null) =>
                    setEndTime(newValue)
                  }
                  value={endTime}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-green-fix-600 hover:bg-green-fix-700"
          >
            {action === "announce" && "Announce"}
            {action === "clone" && "Clone"}
            {action === "update" && "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
