export interface User {
  id?: string;
  name: string;
  age: number;
  city: string;
  imgurl?: string; // Optional field for user profile image URL
  grade: number;
  phoneNumber: string;
  region: string;
  school: string;
  gender: "male" | "female";
  telegram_id: string;
  totalPoints: number;
  isSuspended?: boolean;
  payment: Payment;
}
export interface UserStats {
  total_contests: number;
  total_questions: number;
  correct_answers: number;
  accuracy: number;
  average_time: number;
  subjects: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  chapters: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  grades: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  performance_trend?: Array<{
    month: string;
    accuracy: number;
    questions: number;
  }>;
}
export type PaymentStatus = "Approved" | "Pending" | "Rejected" | "Expired";

export interface Payment {
  id: string;
  userId: string;
  fullName: string;
  bankName: string;
  billScreenshotUrl: string;
  status: PaymentStatus;
  rejectionReason?: string;
  createdAt: string; // ISO String
  updatedAt: string;
  expirationDate: string;
}
export interface ContestSubmission {
  id: string;
  contest: { title: string; subject: string; grade: string };
  totalQuestions: number;
  correctAnswers: number;
  missedQuestions: number;
  score: number;
  submittedAt: Date;
}

export interface SubjectAnalysis {
  subject: string;
  totalQuestions: number;
  correctAnswers: number;
  missedQuestions: number;
  accuracy: number;
}

export interface GradeAnalysis {
  grade: number;
  totalQuestions: number;
  correctAnswers: number;
  missedQuestions: number;
  accuracy: number;
}
