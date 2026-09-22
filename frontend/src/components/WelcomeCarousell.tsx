import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";

// Import the new Rafiki style illustrations
import { ProgrammerRafiki } from "../assets/illustrators/ProgrammerRafiki";
import { TrophyRafiki } from "../assets/illustrators/TrophyRafiki";
import { RocketRafiki } from "../assets/illustrators/RocketRafiki";

// Type for each message object in the carousel
type WelcomeMessage = {
  text: string;
  subtext: string;
  illustration: React.ReactNode;
};

// Interface for the component's props
interface WelcomeCarouselProps {
  user?: {
    first_name?: string | null;
  } | null;
}

// Animation variants for the slide transitions
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 50 : -50,
    opacity: 0,
    scale: 0.98,
  }),
};

const ProfessionalWelcomeCarousel: React.FC<WelcomeCarouselProps> = ({
  user,
}) => {
  const welcomeMessages: WelcomeMessage[] = [
    // --- ILLUSTRATION 1 UPDATED TO RAFIKI STYLE ---
    {
      text: `Welcome back, ${user?.first_name || "Student"}!`,
      subtext: "Ready to conquer today's challenges? 👋",
      illustration: <ProgrammerRafiki className="w-60 h-60" />,
    },
    // --- ILLUSTRATION 2 UPDATED TO RAFIKI STYLE ---
    {
      text: "Sharpen your skills and rise up!",
      subtext: "New coding challenges are now live.",
      illustration: <TrophyRafiki className="w-32 h-32" />,
    },
    // --- ILLUSTRATION 3 UPDATED TO RAFIKI STYLE ---
    {
      text: "Unlock your true potential.",
      subtext: "Every challenge you overcome is a step forward.",
      illustration: <RocketRafiki className="w-32 h-32" />,
    },
  ];

  const [[page, direction], setPage] = useState([0, 0]);
  const pageIndex = Math.abs(page % welcomeMessages.length);

  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
  };

  useEffect(() => {
    const timer = setTimeout(() => paginate(1), 5000); // Auto-play interval
    return () => clearTimeout(timer);
  }, [page]);

  return (
    <div className="relative flex flex-col justify-between bg-gradient-to-br from-blue-700 via-purple-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg overflow-hidden min-h-[340px]">
      {/* Main Content Area */}
      <div className="relative flex-grow flex items-center justify-center">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={page}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute w-full h-full flex flex-col items-center justify-center gap-4 text-center px-8"
          >
            {welcomeMessages[pageIndex].illustration}
            <h2 className="text-2xl font-semibold">
              {welcomeMessages[pageIndex].text}
            </h2>
            <p className="text-blue-100 max-w-sm">
              {welcomeMessages[pageIndex].subtext}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <button
          onClick={() => paginate(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/10 rounded-full p-2 z-10 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Previous message"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => paginate(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/10 rounded-full p-2 z-10 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Next message"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Progress Indicator Row */}
      <div className="flex w-full gap-2 pt-4 flex-shrink-0">
        {welcomeMessages.map((_, index) => (
          <div
            key={index}
            className="w-full h-1 bg-white/20 rounded-full overflow-hidden"
          >
            {index === pageIndex ? (
              <motion.div
                className="h-full bg-yellow-400"
                key={page}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear" }}
              />
            ) : (
              <div
                className="h-full bg-white"
                style={{ width: index < pageIndex ? "100%" : "0%" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfessionalWelcomeCarousel;
