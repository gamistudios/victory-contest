"use client";

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PaymentRequest } from "../../types/payment";
import { Button } from "@/components/ui/button";
import { notifyUser } from "../../services/paymentServices";
import { BellRing, CheckCircle, XCircle, Eye, RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Type definition for handlers passed from the parent component
interface PendingActionsHandlers {
  onApprove: (payment: PaymentRequest) => Promise<void>;
  onReject: (payment: PaymentRequest, reason: string) => Promise<void>;
}
interface ActionHandlerForUndo {
  onPend: (payment: PaymentRequest) => Promise<void>;
}
// --- Cell Components for Modals and Dialogs ---

const PendingActionsCell = ({
  row,
  handlers,
}: {
  row: any;
  handlers: PendingActionsHandlers;
}) => {
  const payment = row.original as PaymentRequest;
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApproveClick = async () => {
    toast.warning("Processing...", {
      description: `Approving payment ${payment.id}`,
    });
    try {
      await handlers.onApprove(payment);
      toast("✅ Success", { description: "Payment has been approved." });
      handlers.onApprove(payment);
    } catch (error) {
      toast.error("❌ Error", {
        description: "Failed to approve payment.",
      });
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason) {
      toast.error("Validation Error", {
        description: "Rejection reason cannot be empty.",
      });
      return;
    }
    toast.warning("Processing...", {
      description: `Rejecting payment ${payment.id}`,
    });
    try {
      await handlers.onReject(payment, rejectionReason);
      toast.success("✅ Success", {
        description: "Payment has been rejected.",
      });
      handlers.onReject(payment, rejectionReason);
    } catch (error) {
      toast.error("❌ Error", {
        description: "Failed to reject payment.",
      });
    } finally {
      setIsRejecting(false);
      setRejectionReason("");
    }
  };

  return (
    <>
      <div className="space-x-2">
        <Button variant="outline" size="sm" onClick={handleApproveClick}>
          <CheckCircle className="mr-2 h-4 w-4" /> Approve
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setIsRejecting(true)}
        >
          <XCircle className="mr-2 h-4 w-4" /> Reject
        </Button>
      </div>

      <AlertDialog open={isRejecting} onOpenChange={setIsRejecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to reject this payment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Please provide a reason for
              rejection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Input
              id="reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Unclear receipt image"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectConfirm}>
              Confirm Rejection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Cell component for the "Show Receipt" button and modal
const ReceiptCell = ({ row }: { row: any }) => {
  const payment = row.original as PaymentRequest;
  const [isViewing, setIsViewing] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setIsViewing(true)}>
        <Eye className="mr-2 h-4 w-4" /> View
      </Button>
      <Dialog open={isViewing} onOpenChange={setIsViewing}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bill Screenshot</DialogTitle>
            <DialogDescription>
              Receipt for payment request {payment.id}
            </DialogDescription>
          </DialogHeader>
          {/* In a real app, `payment.billScreenshotUrl` would point to an actual image */}
          <div className="mt-4 flex items-center justify-center rounded-md border border-dashed p-8">
            <img
              src={
                payment.billScreenshotUrl ?? "https://placehold.co/400x600/png"
              }
              alt="Bill Screenshot"
              className="max-w-full h-auto"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// --- Column Definitions ---

const baseColumns: ColumnDef<PaymentRequest>[] = [
  // ... (keep the same base columns from the previous example)
  { accessorKey: "user_id", header: "User ID" },
  { accessorKey: "fullName", header: "Full Name" },
  { accessorKey: "bankName", header: "Bank" },
  {
    accessorKey: "createdAt",
    header: "Created At",
    cell: ({ row }) => {
      try {
        if (!row.original.createdAt) return 'N/A';
        const date = new Date(row.original.createdAt);
        if (isNaN(date.getTime())) return 'Invalid date';
        return date.toLocaleDateString();
      } catch (error) {
        console.warn('Error formatting createdAt date:', error);
        return 'N/A';
      }
    },
  },
];

// Factory function to get pending columns with handlers
export const getPendingColumns = (
  handlers: PendingActionsHandlers
): ColumnDef<PaymentRequest>[] => [
  ...baseColumns,
  {
    id: "receipt",
    header: "Receipt",
    cell: ReceiptCell,
  },
  {
    id: "actions",
    header: "Actions",
    cell: (props) => <PendingActionsCell {...props} handlers={handlers} />,
  },
];

// --- EXPIRED COLUMNS ---
// (No changes needed for the expired columns definition itself, but included for completeness)

export const expiredColumns: ColumnDef<PaymentRequest>[] = [
  ...baseColumns,
  {
    accessorKey: "expirationDate",
    header: "Expired At",
    cell: ({ row }) => {
      try {
        if (!row.original.expirationDate) return 'N/A';
        const date = new Date(row.original.expirationDate);
        if (isNaN(date.getTime())) return 'Invalid date';
        return date.toLocaleDateString();
      } catch (error) {
        console.warn('Error formatting expirationDate:', error);
        return 'N/A';
      }
    },
  },
  {
    id: "actions",
    cell: function Cell({ row }) {
      const payment = row.original;
      const handleNotifyClick = async () => {
        toast.warning("Sending Notification...", {
          description: `Notifying ${payment.fullName}`,
        });
        try {
          await notifyUser(payment.userId, payment.id);
          toast.success("✅ Notification Sent!", {
            description: `${payment.fullName} has been notified.`,
          });
        } catch (error) {
          toast.error("❌ Error", {
            description: "Failed to send notification.",
          });
        }
      };
      return (
        <Button variant="outline" size="sm" onClick={handleNotifyClick}>
          <BellRing className="mr-2 h-4 w-4" /> Notify User
        </Button>
      );
    },
  },
];

export const getApprovedColumns = (handlers: ActionHandlerForUndo) => {
  return [
    ...baseColumns,
    {
      accessorKey: "updatedAt",
      header: "Approved At",
      cell: ({ row }) => {
        try {
          if (!row.original.updatedAt) return 'N/A';
          const date = new Date(row.original.updatedAt);
          if (isNaN(date.getTime())) return 'Invalid date';
          return date.toLocaleString();
        } catch (error) {
          console.warn('Error formatting updatedAt date:', error);
          return 'N/A';
        }
      },
    },
    {
      accessorKey: "",
      header: "Action",
      cell: function Cell({ row }) {
        const [loading, setloading] = useState(false);
        const [isRejecting, setIsRejecting] = useState(false);
        const payment = row.original;
        const handleRejectConfirm = async () => {
          toast.warning("Undoing payment...", {
            description: `Notifying ${payment.fullName}`,
            duration: 10000,
          });
          try {
            setloading(true);
            await handlers.onPend(payment);
            toast.warning("Operation was sucessfull!", {
              duration: 10000,
            });
          } catch (error) {
            toast.warning("Undoing payment...", {
              description: `Notifying ${payment.fullName}`,
              duration: 10000,
            });
          } finally {
            setloading(false);
          }
        };
        return (
          <>
            <div className="space-x-2">
              <Button
                disabled={loading}
                variant="outline"
                size="sm"
                onClick={() => setIsRejecting(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Undo
              </Button>
            </div>
            <AlertDialog open={isRejecting} onOpenChange={setIsRejecting}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to undo this payment?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. Please provide a reason for
                    rejection.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-400"
                    onClick={handleRejectConfirm}
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        );
      },
    },
  ] as ColumnDef<PaymentRequest>[];
};
export const getRejectColumns = (handlers: ActionHandlerForUndo) => {
  return [
    ...baseColumns,
    {
      accessorKey: "rejectionReason",
      header: "Rejection Reason",
    },
    {
      accessorKey: "updatedAt",
      header: "Rejected At",
      cell: ({ row }) => {
        try {
          if (!row.original.updatedAt) return 'N/A';
          const date = new Date(row.original.updatedAt);
          if (isNaN(date.getTime())) return 'Invalid date';
          return date.toLocaleString();
        } catch (error) {
          console.warn('Error formatting updatedAt date:', error);
          return 'N/A';
        }
      },
    },
    {
      accessorKey: "",
      header: "Action",
      cell: function Cell({ row }) {
        const [loading, setloading] = useState(false);
        const [isRejecting, setIsRejecting] = useState(false);
        const payment = row.original;
        const handleRejectConfirm = async () => {
          toast.warning("Processing", {
            duration: 10000,
          });
          try {
            setloading(true);
            await handlers.onPend(payment);
            toast.success("Successfully sent!", {
              description: `Successfully undo payment for user ${payment.userId}`,
            });
          } catch (error) {
            toast.error("❌ Error", {
              description: "Failed to send notification.",
            });
          } finally {
            setloading(false);
          }
        };
        return (
          <>
            <div className="space-x-2">
              <Button
                disabled={loading}
                variant="outline"
                size="sm"
                onClick={() => setIsRejecting(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Undo
              </Button>
            </div>
            <AlertDialog open={isRejecting} onOpenChange={setIsRejecting}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to undo this payment?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. Please provide a reason for
                    rejection.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-400"
                    onClick={handleRejectConfirm}
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        );
      },
    },
  ] as ColumnDef<PaymentRequest>[];
};
