export type PaymentStatus = "Pending" | "Approved" | "Rejected" | "Expired";

export interface PaymentRequest {
  id: string;
  userId: string;
  fullName: string;
  bankName: string;
  billScreenshotUrl: string;
  status: PaymentStatus;
  rejectionReason?: string;
  createdAt: string; // Using string for simplicity, can be Date object
  updatedAt: string;
  expirationDate?: string;
  program_ids?: string[]; // programs the plan covered at purchase (absent on legacy rows)
}
