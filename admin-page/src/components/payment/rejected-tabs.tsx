import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { getRejectColumns } from "./columns";
import {
  fetchRejectedPayments,
  pendPaymentRequest,
} from "../../services/paymentServices";
import { PaymentRequest } from "../../types/payment";

export function RejectedPaymentsTab() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await fetchRejectedPayments();
      setPayments(data);
      setIsLoading(false);
    };
    loadData();
  }, []);
  const onPend = async (payment: PaymentRequest) => {
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
    payment.status = "Pending";
    await pendPaymentRequest(payment);
  };

  const columns = useMemo(
    () =>
      getRejectColumns({
        onPend: onPend,
      }),
    []
  );

  if (isLoading) return <div className="p-4">Loading rejected payments...</div>;

  // Horizontal-scroll wrapper + min-width inner so the 7-column table
  // adapts by scrolling at narrow widths instead of compressing cells.
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[46rem]">
        <DataTable columns={columns} data={payments} />
      </div>
    </div>
  );
}
