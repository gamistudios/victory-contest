import { Badge } from "../ui/badge";
import { PaymentRequest, PaymentStatus } from "../../types/index"; // Updated import
import { CheckCircle, Clock, XCircle, Ban, Eye } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

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

  return (
    <li className="mb-8 ms-6">
      <span className="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </span>
      <div className="flex flex-col p-3 bg-card border border-gray-200 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-gray-900">
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
            className={` ${variant === "default" ? "bg-green-fix-700" : ""}`}
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
        <div className="p-3 mt-2 text-xs text-red-800 rounded-lg bg-red-50">
          <span className="font-medium">Reason:</span> {request.rejectionReason}
        </div>
      )}

      <div className="mt-1 text-xs text-gray-400 ml-1">
        ID: {request.id}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              Bill Receipt
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            <img
              src={
                request.billScreenshotUrl ||
                "https://placehold.co/600x800/png"
              }
              alt={"Payment receipt"}
              className="w-full h-auto rounded-lg border"
            />
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
