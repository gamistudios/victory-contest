import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { getApprovedColumns } from "./columns";
import {
  fetchApprovedPayments,
  pendPaymentRequest,
} from "../../services/paymentServices";
import { PaymentRequest } from "../../types/payment";

export function ApprovedPaymentsTab() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const data = await fetchApprovedPayments();
      setPayments(data);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const onPend = async (payment: PaymentRequest) => {
    payment.status = "Pending";
    await pendPaymentRequest(payment);
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
  };

  const columns = useMemo(
    () =>
      getApprovedColumns({
        onPend: onPend,
      }),
    []
  );

  if (isLoading) return <div className="p-4">Loading approved payments...</div>;

  return <DataTable columns={columns} data={payments} />;
}
