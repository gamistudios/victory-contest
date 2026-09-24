// src/hooks/useCountdown.ts
import { useState, useEffect } from "react";

const calculateRemainingTime = (targetDate: string) => {
  const difference = +new Date(targetDate) - +new Date();
  let timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

  if (difference > 0) {
    timeLeft = {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }
  return timeLeft;
};

export function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState(calculateRemainingTime(targetDate));

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateRemainingTime(targetDate));
    }, 1000);

    return () => clearTimeout(timer);
  });

  return timeLeft;
}
