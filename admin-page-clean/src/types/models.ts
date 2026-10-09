export interface Student {
  id?: string;
  name: string;
  telegram_id: string;
  /** Backend domain.Student serializes this as `gender`. */
  gender?: string;
  age: number;
  grade: number;
  school?: string;
  woreda?: string;
  city?: string;
  region?: string;
  imgurl?: string;
  /** Derived server-side from the student's unexpired approved payments. */
  is_premium?: boolean;
  contests: Contest[];
}
export interface Admin {
  /** Backend domain.Admin row key; GET /api/admin/ always includes it. */
  id?: string;
  name: string;
  password?: string;
  email: string;
  imgurl?: string;
  is_approved?: boolean;
}
export interface Contest {
  id?: string;
  title: string;
  description?: string;
  questions: Question[];
  start_time: string;
  end_time: string;
  active_contenstants?: Student[];
  submissions?: Submission[];
  grade: string;
  subject: string;
  prize: string;
  status: string;
  type: "free" | "premium";
}
export interface APIContest extends Omit<Contest, "questions"> {
  questions: string[];
}
export interface Payment {
  id?: string;
  user_id?: string;
  fullName?: string;
  bankName?: string;
  billScreenshotUrl?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Absent until an admin (or the Stars webhook) approves a payment. */
  expirationDate?: string;
}
export interface Question {
  id?: string;
  question_text: string;
  multiple_choice: string[];
  answer: number | null;
  explanation: string;
  grade: string;
  chapter: string;
  subject: string;
  question_image?: string;
  explanation_image?: string;
  /** Aligned with multiple_choice: entry i is a Cloudinary URL for the photo
   *  of option i, or "" when that option is text-only. */
  option_images?: string[];
}

export interface Submission {
  id?: string;
  student: {
    student_id: string;
    imgurl: string;
    name: string;
  };
  contest_id: string;
  submission_time: string;
  score: number;
  missed_questions: Question[];
  time_spend?: string;
}
