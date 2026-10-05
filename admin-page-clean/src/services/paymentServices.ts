import { PaymentRequest } from "@/types/payment";
import api from "./api";

// The backend payment JSON uses snake_case `user_id`, while the UI type and all
// consumers use `userId`. Without this map, notify calls sent recipient_id:"".
const normalizePayment = (p: PaymentRequest & { user_id?: string }): PaymentRequest => ({
  ...p,
  userId: p.userId ?? p.user_id ?? "",
});

const mapPayments = (res: { data?: { payments?: unknown[] } }): PaymentRequest[] =>
  ((res.data?.payments ?? []) as PaymentRequest[]).map(normalizePayment);

// Simulate fetching data
export const fetchPendingPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/withstatus?status=Pending");
  return mapPayments(res);
};

export const fetchExpiredPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/getexpired");
  return mapPayments(res);
};

// Real notification: POST /api/notification (admin-gated, AddNotification).
// The student NotificationCenter renders unknown types with the generic bell,
// so type "payment" displays without any student-app change. sent_at must be
// RFC3339 — AddNotification stores the body verbatim (only id is generated).
export const notifyUser = async (
  userId: string,
  message?: string
): Promise<{ success: boolean }> => {
  // Trailing slash: the gin route is POST /api/notification/ and a 307 to it
  // is not followed cross-origin.
  await api.post("/api/notification/", {
    recipient_id: userId,
    title: "Payment reminder",
    message:
      message ??
      "An administrator sent you a reminder about your payment request.",
    type: "payment",
    is_read: false,
    sent_at: new Date().toISOString(),
  });
  return { success: true };
};

// Per-request outcome matters for the bulk action: one failure must not
// erase the successes (Promise.all would do exactly that).
export const notifyUsers = async (
  userIds: string[],
  message?: string
): Promise<{ sent: number; failed: number }> => {
  const results = await Promise.allSettled(
    userIds.map((id) => notifyUser(id, message))
  );
  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
};

export const approvePaymentRequest = async (
  payment: PaymentRequest
): Promise<{ success: boolean }> => {
  await api.post(`/api/payment/update`, payment);
  return { success: true };
};

// Simulate rejecting a payment
export const rejectPaymentRequest = async (
  payment: PaymentRequest
): Promise<{ success: boolean }> => {
  await api.post(`/api/payment/update`, payment);
  return { success: true };
};
export const pendPaymentRequest = async (
  payment: PaymentRequest
): Promise<{ success: boolean }> => {
  await api.post(`/api/payment/update`, payment);
  return { success: true };
};

export const fetchApprovedPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/withstatus?status=Approved");
  return mapPayments(res);
};

export const fetchRejectedPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/withstatus?status=Rejected");
  return mapPayments(res);
};
