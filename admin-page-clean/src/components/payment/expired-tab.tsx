import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { expiredColumns } from "./columns";
import {
  fetchExpiredPayments,
  notifyUsers,
} from "../../services/paymentServices";
import { PaymentRequest } from "../../types/payment";
import { Button } from "../ui/button";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

export function ExpiredPaymentsTab() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotifying, setIsNotifying] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await fetchExpiredPayments();
      setPayments(data);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleNotifyAll = async () => {
    setIsNotifying(true);
    toast.warning("Bulk Notification Started", {
      description: `Notifying all ${payments.length} users with expired payments.`,
    });

    try {
      const { sent, failed } = await notifyUsers(
        payments.map((p) => p.userId),
        "Your payment window has expired. Please submit a new payment request to continue."
      );
      if (failed === 0) {
        toast("✅ Bulk Notification Complete", {
          description: `Notified all ${sent} users.`,
        });
      } else {
        toast.error("Bulk Notification Partially Failed", {
          description: `${sent} sent, ${failed} failed.`,
        });
      }
    } finally {
      setIsNotifying(false);
    }
  };

  if (isLoading) return <div className="p-4">Loading expired payments...</div>;

  return (
    <div className="space-y-4">
      {/* Wrap-toolbar: button is full-width on phones, right-sized from sm up */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          onClick={handleNotifyAll}
          disabled={isNotifying || payments.length === 0}
          className="w-full sm:w-auto"
        >
          <BellRing className="mr-2 h-4 w-4" />
          {isNotifying ? "Notifying..." : "Notify All Expired"}
        </Button>
      </div>
      <div className="w-full overflow-x-auto">
        <div className="min-w-[42rem]">
          <DataTable columns={expiredColumns} data={payments} />
        </div>
      </div>
    </div>
  );
}
