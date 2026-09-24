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

  return <DataTable columns={columns} data={payments} />;
}
