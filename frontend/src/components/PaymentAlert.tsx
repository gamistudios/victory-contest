import { useEffect, useState } from "react";
import { PaymentRequest } from "../types";
import { fetchUserPaymentRequests } from "../services/paymentServices";
import { useTelegram } from "../hooks/useTelegram";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertTriangle, PopcornIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PaymentAlert({
  onVisibilityChange,
}: {
  onVisibilityChange?: (isVisible: boolean) => void;
}) {
  const { user: tgUser } = useTelegram();
  const navigate = useNavigate();

  const [payments, setpayments] = useState<PaymentRequest[] | null>(null);
  const [isVisible, setIsVisible] = useState(true); // Internal state for dismissal

  useEffect(() => {
    if (!tgUser?.id) return;
    const fetchUserPayments = async () => {
      try {
        const payments = await fetchUserPaymentRequests(tgUser?.id.toString());
        setpayments(payments);
      } catch (err) {}
    };
    fetchUserPayments();
  }, [tgUser]);

  let isAboutToExpire = false;

  if (payments != null) {
    const THREE_DAYS_IN_MS = 3 * 24 * 60 * 60 * 1000;

    for (let index = 0; index < payments.length; index++) {
      const payment = payments[index];
      if (payment.status != "Approved") {
        continue;
      }
      const timeDiff = new Date(payment.expirationDate!).getTime() - Date.now();
      if (timeDiff > THREE_DAYS_IN_MS) break;
      if (timeDiff <= THREE_DAYS_IN_MS && timeDiff > 0) {
        isAboutToExpire = true;
        break;
      }
    }
  }

  const isAlertVisible = isAboutToExpire && isVisible;
  useEffect(() => {
    onVisibilityChange?.(isAlertVisible);
  }, [isAlertVisible, onVisibilityChange]);

  if (!isAlertVisible) {
    return null;
  }

  // The alert is visible, so return the JSX.
  // We no longer need the onVisibilityChange call here.
  return (
    <Alert variant="warning" className="shadow-md">
      <AlertTriangle className="h-5 w-5" />
      <AlertDescription>
        Your payment is about to expire. Please renew to maintain access.
        <span
          onClick={() => navigate("/payment")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate("/payment");
          }}
          // 4. Style the action to be clear but not overpowering
          className="ml-2 font-medium text-amber-900 underline underline-offset-2 cursor-pointer hover:text-amber-800"
        >
          Subscribe Now
        </span>
      </AlertDescription>

      <button
        onClick={() => setIsVisible(false)}
        className="absolute top-2 right-2 p-1.5 rounded-full text-amber-900/70 hover:bg-amber-100/60 hover:text-amber-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
