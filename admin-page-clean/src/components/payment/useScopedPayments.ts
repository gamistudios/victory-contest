// Applies the header "Working in" program (plan 5.8) to payment requests.
// A request carries the programs its plan covered; legacy rows predate plans and
// have none, so they stay visible under every scope rather than vanishing.
import { useMemo } from "react";
import { useScope } from "@/app/ProgramContext";
import type { PaymentRequest } from "@/types/payment";

export function useScopedPayments(payments: PaymentRequest[]): PaymentRequest[] {
  const { program } = useScope();
  return useMemo(
    () => (program ? payments.filter((p) => !p.program_ids?.length || p.program_ids.includes(program)) : payments),
    [payments, program],
  );
}
