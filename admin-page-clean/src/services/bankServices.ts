import api from "./api";
import { describeApiError } from "./feedbackServices";

// Wire shape of /api/banks (backend Bank domain type, snake_case).
export interface Bank {
  id: string;
  name: string;
  account_number: string;
  account_holder: string;
  description: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface BankInput {
  name: string;
  account_number: string;
  account_holder?: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export const bankServices = {
  // Admin view: includes deactivated rows, so the list shows everything.
  listAll: async (): Promise<Bank[]> => {
    const res = await api.get("/api/banks/all");
    return res.data.banks;
  },

  create: async (input: BankInput): Promise<string> => {
    const res = await api.post("/api/banks/", input);
    return res.data.id;
  },

  // Omitting is_active keeps the stored flag (the backend preserves it on
  // PUT when the field is absent), so the form shape is accepted as-is.
  update: async (id: string, input: BankInput): Promise<void> => {
    await api.put(`/api/banks/${id}`, input);
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/banks/${id}`);
  },
};

export { describeApiError };
