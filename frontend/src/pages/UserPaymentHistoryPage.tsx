import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { fetchUserPaymentRequests } from "../services/paymentServices"; // Updated import
import { PaymentRequest } from "../types/index"; // Updated import
import { PaymentTimelineItem } from "../components/payment-history/payment-timeline-item";
import { useTelegram } from "../hooks/useTelegram";

// This is a simple update to the timeline component props
function UpdatedPaymentTimeline({ requests }: { requests: PaymentRequest[] }) {
  if (!requests || requests.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No payment history found.
      </div>
    );
  }
  return (
    <ol className="relative border-s border-gray-200 dark:border-gray-700">
      {requests.map((request) => (
        <PaymentTimelineItem key={request.id} request={request} />
      ))}
    </ol>
  );
}

export function UserPaymentHistoryPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useTelegram();

  useEffect(() => {
    // ... fetching logic remains the same ...
    const loadData = async () => {
      if (!user?.id) return;
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchUserPaymentRequests(user?.id.toString());
        setRequests(data);
      } catch (err) {
        setError("Failed to load payment history. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [user?.id]);

  const renderContent = () => {
    // ... render logic remains the same ...
    if (isLoading) {
      return <div className="text-center p-8">Loading your history...</div>;
    }
    if (error) {
      return <div className="text-center text-red-500 p-8">{error}</div>;
    }
    // This component is defined in the previous answer, no changes needed here.
    return <UpdatedPaymentTimeline requests={requests} />;
  };

  return (
    <div className="bg-gray-50 dark:bg-black p-2 sm:p-4 md:p-8">
      <Card className="max-w-4xl mx-auto shadow-none sm:shadow-md border-0 sm:border">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">Payment History</CardTitle>
          <CardDescription>A record of your payment requests.</CardDescription>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}
