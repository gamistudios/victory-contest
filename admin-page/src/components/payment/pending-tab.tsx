import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { getPendingColumns } from "./columns";
import {
  approvePaymentRequest,
  fetchPendingPayments,
  rejectPaymentRequest,
} from "../../services/paymentServices";
import { PaymentRequest } from "../../types/payment";

export function PendingPaymentsTab() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await fetchPendingPayments();
      setPayments(data);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleApprove = async (payment: PaymentRequest) => {
    payment.status = "Approved";
    await approvePaymentRequest(payment);
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
  };

  const handleReject = async (payment: PaymentRequest, reason: string) => {
    payment.status = "Rejected";
    payment.rejectionReason = reason;
    await rejectPaymentRequest(payment);
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
  };

  // Memoize columns to prevent re-creation on every render
  const columns = useMemo(
    () =>
      getPendingColumns({
        onApprove: handleApprove,
        onReject: handleReject,
      }),
    []
  );

  if (isLoading) return <div className="p-4">Loading pending payments...</div>;

  return <DataTable columns={columns} data={payments} />;
}
