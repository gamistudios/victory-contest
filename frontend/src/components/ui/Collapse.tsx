import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const CollapseText: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <div
        data-state={isOpen ? "open" : "closed"}
        className="transition-all duration-700 ease-in-out overflow-hidden data-[state=closed]:h-0 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
      >
        {children}
      </div>

      <p className="mt-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex items-center gap-x-1 text-sm font-semibold rounded-lg border border-transparent text-blue-600 decoration-2 hover:text-blue-700 hover:underline focus:outline-none focus:underline focus:text-blue-700 dark:text-blue-500 dark:hover:text-blue-600 dark:focus:text-blue-600"
          aria-expanded={isOpen}
        >
          <span>{isOpen ? "Read less" : "Read more"}</span>
          <ChevronDown
            className={`size-4 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </p>
    </div>
  );
};

export default CollapseText;
