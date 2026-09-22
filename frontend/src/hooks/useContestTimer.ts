import { useState, useEffect } from "react";
import { parseISO, isAfter, isBefore } from "date-fns";

// Define the possible states for our timer
export type ContestStatus = "LOADING" | "UPCOMING" | "ACTIVE" | "ENDED";

// Define the shape of the data our hook will return
interface ContestTimerState {
  timeLeft: string;
  status: ContestStatus;
}

// A utility function to format the time duration
const formatDistance = (distance: number): string => {
  if (distance <= 0) return "";

  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

/**
 * A custom hook to manage the countdown logic for a contest.
 * It tracks the contest's state from upcoming, to active, to ended.
 *
 * @param startTimeISO - The ISO string for the contest start time.
 * @param endTimeISO - The ISO string for the contest end time.
 * @returns An object with the formatted time left and the current contest status.
 */
export const useContestTimer = (
  startTimeISO: string,
  endTimeISO: string
): ContestTimerState => {
  const [timerState, setTimerState] = useState<ContestTimerState>({
    timeLeft: "Loading...",
    status: "LOADING",
  });

  useEffect(() => {
    // It's crucial that your contest object has an `end_time` property.
    if (!startTimeISO || !endTimeISO) {
      setTimerState({ timeLeft: "Invalid Dates", status: "ENDED" });
      return;
    }

    const startTime = parseISO(startTimeISO);
    const endTime = parseISO(endTimeISO);

    const intervalId = setInterval(() => {
      const now = new Date();

      // State 1: Contest is upcoming
      if (isAfter(startTime, now)) {
        const distance = startTime.getTime() - now.getTime();
        setTimerState({
          timeLeft: formatDistance(distance),
          status: "UPCOMING",
        });
      }
      // State 2: Contest is active
      else if (isBefore(startTime, now) && isAfter(endTime, now)) {
        const distance = endTime.getTime() - now.getTime();
        setTimerState({
          timeLeft: formatDistance(distance),
          status: "ACTIVE",
        });
      }
      // State 3: Contest has ended
      else {
        setTimerState({
          timeLeft: "Contest Ended",
          status: "ENDED",
        });
        clearInterval(intervalId); // Stop the interval once the contest is over
      }
    }, 1000);

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, [startTimeISO, endTimeISO]); // Rerun effect if the contest times change

  return timerState;
};
