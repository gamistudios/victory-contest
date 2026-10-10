import { Construction } from "lucide-react";
import { motion } from "framer-motion";

export default function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-gray-100 text-gray-800">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="text-center w-full max-w-sm sm:max-w-md bg-card shadow-lg rounded-3xl p-6 sm:p-8"
      >
        <div className="flex justify-center mb-4 sm:mb-6">
          <Construction className="w-14 h-14 sm:w-16 sm:h-16 text-yellow-500 animate-bounce" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Coming Soon</h1>
        <p className="text-gray-500 text-sm sm:text-base mb-4 sm:mb-6">
          We're working hard to finish this page. Check back later for updates!
        </p>

        <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-gray-500">
          <Construction className="h-4 w-4" aria-hidden="true" />
          <span>Under Construction</span>
          <Construction className="h-4 w-4" aria-hidden="true" />
        </div>
      </motion.div>
    </div>
  );
}
