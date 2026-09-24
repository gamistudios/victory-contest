import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { expiredColumns } from "./columns";
import {
  fetchExpiredPayments,
  notifyUser,
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

    const notificationPromises = payments.map((p) =>
      notifyUser(p.userId, p.id)
    );

    try {
      await Promise.all(notificationPromises);
      toast("✅ Bulk Notification Complete", {
        description: `Successfully notified all ${payments.length} users.`,
      });
    } catch (error) {
      toast.error("❌ Notification Error", {
        description: "Some notifications may have failed. Please check logs.",
      });
    } finally {
      setIsNotifying(false);
    }
  };

  if (isLoading) return <div className="p-4">Loading expired payments...</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          onClick={handleNotifyAll}
          disabled={isNotifying || payments.length === 0}
        >
          <BellRing className="mr-2 h-4 w-4" />
          {isNotifying ? "Notifying..." : "Notify All Expired"}
        </Button>
      </div>
      <DataTable columns={expiredColumns} data={payments} />
    </div>
  );
}
