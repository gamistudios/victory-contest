import api from "./api";
import { PaymentRequest } from "../types";
export async function sendPaymentInfo(formData: FormData | PaymentRequest) {
  if (formData instanceof FormData) {
    for (const pair of formData.entries()) {
      console.log(pair[0] + ": " + pair[1]);
    }
  }
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
