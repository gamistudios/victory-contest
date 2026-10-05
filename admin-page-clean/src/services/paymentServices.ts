import { PaymentRequest } from "@/types/payment";
import api from "./api";

// Simulate fetching data
export const fetchPendingPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/withstatus?status=Pending");
  return res.data.payments;
};

export const fetchExpiredPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/getexpired");
  return res.data.payments;
};

// Real notification: POST /api/notification (admin-gated, AddNotification).
// The student NotificationCenter renders unknown types with the generic bell,
// so type "payment" displays without any student-app change. sent_at must be
// RFC3339 — AddNotification stores the body verbatim (only id is generated).
export const notifyUser = async (
  userId: string,
  message?: string
): Promise<{ success: boolean }> => {
  await api.post("/api/notification", {
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
  return res.data.payments;
};

export const fetchRejectedPayments = async (): Promise<PaymentRequest[]> => {
  const res = await api.get("/api/payment/withstatus?status=Rejected");
  return res.data.payments;
};
