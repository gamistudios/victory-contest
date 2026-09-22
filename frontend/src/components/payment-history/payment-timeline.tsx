import { PaymentRequest } from "../../types/index";
import { PaymentTimelineItem } from "./payment-timeline-item";

export function PaymentTimeline({ payments }: { payments: PaymentRequest[] }) {
  if (!payments || payments.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
        No payment history found.
      </div>
    );
  }

  return (
    <ol className="relative border-s border-gray-200 dark:border-gray-700">
      {payments.map((payment) => (
        <PaymentTimelineItem key={payment.id} request={payment} />
      ))}
    </ol>
  );
}
