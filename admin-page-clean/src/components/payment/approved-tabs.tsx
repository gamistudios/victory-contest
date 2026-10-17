import { useScopedPayments } from "./useScopedPayments";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { getApprovedColumns } from "./columns";
import {
  fetchApprovedPayments,
  pendPaymentRequest,
} from "../../services/paymentServices";
import { PaymentRequest } from "../../types/payment";
import { revokePayment } from "../../services/pricingServices";

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

  // Revoke keeps the payment row but removes the access it granted (server rebuilds entitlements).
  const onRevoke = async (payment: PaymentRequest) => {
    await revokePayment(payment.id);
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
  };

  const columns = useMemo(
    () =>
      getApprovedColumns({
        onPend: onPend,
        onRevoke: onRevoke,
      }),
    []
  );
  const scoped = useScopedPayments(payments);

  if (isLoading) return <div className="p-4">Loading approved payments...</div>;

  // Horizontal-scroll wrapper + min-width inner so the table adapts by
  // scrolling at narrow widths instead of compressing cells.
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[42rem]">
        <DataTable columns={columns} data={scoped} />
      </div>
    </div>
  );
}
