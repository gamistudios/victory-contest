import { Construction } from "lucide-react";
import { motion } from "framer-motion";

export default function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="text-center w-full max-w-sm sm:max-w-md bg-white dark:bg-gray-800 shadow-lg rounded-3xl p-6 sm:p-8"
      >
        <div className="flex justify-center mb-4 sm:mb-6">
          <Construction className="w-14 h-14 sm:w-16 sm:h-16 text-yellow-500 animate-bounce" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Coming Soon</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base mb-4 sm:mb-6">
          We're working hard to finish this page. Check back later for updates!
        </p>

        <div className="flex justify-center space-x-1 text-xs sm:text-sm text-gray-400 dark:text-gray-500">
          <span>🚧</span>
          <span>Under Construction</span>
          <span>🚧</span>
        </div>
      </motion.div>
    </div>
  );
}
