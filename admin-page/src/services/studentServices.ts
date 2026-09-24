import { User } from "@/types/user";
import api from "./api";
import { Student } from "@/types/models";

// One contest submission as embedded in the quickstat payload
// (domain.Submission in the backend; only the fields we use are typed).
export interface QuickStatSubmission {
  score: number;
  missed_questions?: unknown[];
}

// Raw `stat` object returned by GET /api/student/quickstat/:id
// (admin-gated; see backend student_usecase.GetQuickStat).
export interface QuickStat {
  student_id?: string;
  telegram_id?: string;
  name?: string;
  totalPoints?: number;
  contestsCompleted?: number;
  payment?: unknown;
  contestSubmissions?: QuickStatSubmission[];
}

// Aggregated profile stats the StatsCards / ProfileHeader render.
export interface StudentProfileStats {
  totalPoints: number;
  totalContests: number;
  totalQuestions: number;
  correctAnswers: number;
  /** 0-100, rounded. */
  accuracy: number;
}

// Student row as the backend actually serializes domain.Student: the gender
// key is `gender` (the frontend Student type historically declared `sex`).
export type StudentRow = Student & { gender?: string };

export async function getUserProfile(userId: string): Promise<User> {
  const res = await api.get(`/api/student/profile-admin/${userId}`);

  return res.data.profile;
}

// Fetches the admin-gated quickstat and aggregates it into the numbers the
// profile stats cards display. Throws when the request fails so callers can
// degrade gracefully.
export async function getStudentStats(studentId: string): Promise<StudentProfileStats> {
  const res = await api.get(`/api/student/quickstat/${studentId}`);
  const stat: QuickStat | undefined = res.data?.stat;
  if (!stat) {
    throw new Error("quickstat response is missing the stat object");
  }

  const submissions = stat.contestSubmissions ?? [];
  let totalQuestions = 0;
  let correctAnswers = 0;
  for (const sub of submissions) {
    const score = Number(sub.score) || 0;
    const missed = Array.isArray(sub.missed_questions)
      ? sub.missed_questions.length
      : 0;
    correctAnswers += score;
    totalQuestions += score + missed;
  }
  const accuracy =
    totalQuestions > 0 ? Math.round((correctAnswers * 100) / totalQuestions) : 0;

  return {
    totalPoints: Number(stat.totalPoints) || 0,
    totalContests: Number(stat.contestsCompleted) || 0,
    totalQuestions,
    correctAnswers,
    accuracy,
  };
}

// PUT /api/student/:id — the backend (student_handler.UpdateStudent) binds the
// body directly into domain.Student and takes the row key from the URL param,
// so `studentId` is the student's id (its telegram id) and `updates` must be a
// flat Student-fields object, not wrapped in another key. Note the repository
// skips zero values, so this can only set truthy fields (e.g. suspend).
export async function updateUserInfo(
  studentId: string,
  updates: Record<string, unknown>
) {
  const res = await api.put(`/api/student/${studentId}`, updates);

  return res.data;
}

// POST /api/notification/ (admin-gated). Mirrors domain.Notification; the
// backend persists the row and owns every delivery concern.
export interface StudentNotificationInput {
  recipientId: string;
  title: string;
  message: string;
  type: string;
}

export async function sendStudentNotification(
  input: StudentNotificationInput
): Promise<string> {
  const res = await api.post("/api/notification/", {
    recipient_id: input.recipientId,
    title: input.title,
    message: input.message,
    type: input.type,
    is_read: false,
    sent_at: new Date().toISOString(),
  });

  return res.data?.id;
}

export async function getAllStudents(): Promise<StudentRow[]> {
  const res = await api.get(`/api/student/`);
  const { students }: { students: StudentRow[] } = res.data;
  return students ?? [];
}

export async function getGradesAndSchools(): Promise<{ grades: string[]; schools: string[]; cities: string[] }> {
  const res = await api.get(`/api/student/grades-and-schools`);
  return res.data;
}

export async function deleteStudent(studentId: string): Promise<void> {
  await api.delete(`/api/student/${studentId}`);
}
