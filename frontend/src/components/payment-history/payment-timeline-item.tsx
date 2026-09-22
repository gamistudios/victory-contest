import { Badge } from "../ui/badge";
import { PaymentRequest, PaymentStatus } from "../../types/index"; // Updated import
import { CheckCircle, Clock, XCircle, Ban, Eye, X } from "lucide-react";
import { Button } from "../ui/button";

import { useState } from "react";

const statusMap: Record<
  PaymentStatus,
  {
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ReactNode;
  }
> = {
  Approved: {
    variant: "default",
    icon: <CheckCircle className="h-5 w-5 text-green-500" />,
  },
  Pending: {
    variant: "secondary",
    icon: <Clock className="h-5 w-5 text-blue-500" />,
  },
  Rejected: { variant: "destructive", icon: <XCircle className="h-5 w-5" /> },
  Expired: {
    variant: "outline",
    icon: <Ban className="h-5 w-5 text-gray-500" />,
  },
};

export function PaymentTimelineItem({ request }: { request: PaymentRequest }) {
  const { variant, icon } = statusMap[request.status];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <li className="mb-8 ms-6">
      <span className="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
        {icon}
      </span>
      <div className="flex flex-col p-3 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-gray-900 dark:text-white">
            <span className="text-gray-500 text-sm">Sent to</span> :{" "}
            {request.bankName}
          </span>
          <time className="text-xs font-normal text-gray-400">
            {(() => {
              try {
                if (!request.createdAt) return 'Unknown date';
                const date = new Date(request.createdAt);
                if (isNaN(date.getTime())) return 'Invalid date';
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              } catch (error) {
                console.warn('Error formatting createdAt date:', error);
                return 'Unknown date';
              }
            })()}
          </time>
        </div>
        <div className="flex justify-between items-center">
          <Badge
            variant={variant}
            className={` ${variant === "default" ? "bg-green-700" : ""}`}
          >
            {request.status}
          </Badge>

          {/* ✅ The button now just toggles our state */}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => setIsModalOpen(true)}
          >
            <Eye className="mr-1 h-3 w-3" />
            View Receipt
          </Button>
        </div>
      </div>

      {request.rejectionReason && (
        <div className="p-3 mt-2 text-xs text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400">
          <span className="font-medium">Reason:</span> {request.rejectionReason}
        </div>
      )}

      <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 ml-1">
        ID: {request.id}
      </div>

      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-100 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm"
        >
          {/* The Modal Content */}
          <div
            onClick={handleContentClick}
            className="relative w-11/12 max-w-lg p-4 bg-white rounded-lg shadow-xl dark:bg-gray-800"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-2 right-2 p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Bill Receipt
            </h3>

            {/* Image Display */}
            <div className="mt-2">
              <img
                src={
                  request.billScreenshotUrl ||
                  "https://placehold.co/600x800/png"
                }
                alt={"bill"}
                className="w-full h-auto rounded-lg border"
              />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
