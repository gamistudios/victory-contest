import api from "./api";
import { PaymentRequest } from "../types";
export async function sendPaymentInfo(
  formData: FormData | Omit<PaymentRequest, "status">
) {
  const res = await api.post("/payment/", formData, {
    // Avoid sending cookies for this call to reduce CORS friction during dev
    withCredentials: false,
    headers: {
      // Let Axios set proper multipart boundary; do not set Content-Type explicitly
      Accept: "application/json",
    },
  });
  return res.data;
}

export const fetchUserPaymentRequests = async (
  userId: string
): Promise<PaymentRequest[]> => {
  const res = await api.get(`/payment/${userId}`);
  return res.data.payments;
};

export interface PaymentSettings {
  allow_stars: boolean;
}

export interface PaymentSettingsUpdate extends PaymentSettings {
  stars_amount: number;
}

// The student payment page polls this unauthenticated read to decide whether
// the Telegram Stars option is visible at all. It is hidden by default and
// only appears once an admin has switched allow_stars on.
export async function getPaymentSettings(
  signal?: AbortSignal
): Promise<PaymentSettings> {
  const res = await api.get("/payment/settings", { signal });
  return res.data as PaymentSettings;
}

// Admin-only write of the global Stars switch and its XTR invoice price.
export async function updatePaymentSettings(
  settings: PaymentSettingsUpdate
): Promise<PaymentSettingsUpdate> {
  const res = await api.put("/payment-admin/settings", settings);
  return res.data as PaymentSettingsUpdate;
}
