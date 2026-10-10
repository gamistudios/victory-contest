import { CreditCard } from "lucide-react";
import { PaymentStarsSettings } from "@/components/payment/stars-settings";
import { BankAccountsSection } from "./bankAccounts";

// Payment Management screen under Settings: manages the payment methods
// (bank accounts students pay with) and the global Telegram Stars payment
// settings.
export function PaymentManagementPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-brand-ink" />
        <h1 className="text-xl font-bold">Payment Management</h1>
      </div>

      <BankAccountsSection />
      <PaymentStarsSettings />
    </div>
  );
}
