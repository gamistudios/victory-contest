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
  primary_program_id?: string;
  enrollments?: { program_id: string; stream_id: string; confirmed?: boolean }[];
  region_id?: string;
  city_id?: string;
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
  /** Raw stored question-id list; survives even when the questions are archived
   *  away, so the UI can tell "N linked, none archived" from "never had any". */
  question_ids?: string[];
  start_time: string;
  end_time: string;
  active_contenstants?: Student[];
  submissions?: Submission[];
  grade: string;
  subject: string;
  /** Optional program/stream scope; premium access is then checked per program. */
  scope?: Scope;
  prize: string;
  status: string;
  type: "free" | "premium";
  /** Phase 2 assessment settings (all optional; empty mode = legacy global). */
  kind?: string;
  mode?: "self_paced" | "global";
  duration_minutes?: number;
  late_penalty_percent?: number;
  reveal?: "at_end" | "on_submit";
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  year?: string;
  source?: string;
  attempts_count?: number;
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
  topic?: string;
  difficulty?: string;
  year?: number;
  source?: string;
  verified?: boolean;
  verified_by?: string;
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
  /** Optional program/stream/subject/chapter; legacy questions have none. */
  scope?: Scope;
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

export interface Scope {
  program_id: string;
  stream_id: string;
  subject_id?: string;
  chapter_id?: string;
}
