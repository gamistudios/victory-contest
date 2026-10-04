import { Submission } from "@/types/models";

export function transformSubmission(submissions: Submission[]) {
  // Normalize submission time to milliseconds since epoch
  const toMs = (t: string): number => {
    const parsedIso = Date.parse(t);
    if (!Number.isNaN(parsedIso)) return parsedIso;
    const parsedInt = parseInt(t as unknown as string, 10);
    return Number.isNaN(parsedInt) ? 0 : parsedInt;
  };

  submissions.sort((a: Submission, b: Submission) =>
    b.score !== a.score
      ? b.score - a.score
      : toMs(a.submission_time) - toMs(b.submission_time)
  );

  const leaderboard = submissions.map((sub, index) => {
    return {
      name: sub.student.name,
      // Prefer student_id if present; fall back to id from backend payloads
      student_id:
        (sub.student as any).student_id ?? (sub.student as any).id ?? "",
      rank: index + 1,
      penalty: sub.missed_questions.length,
      solved: sub.score,
      submission_time: toMs(sub.submission_time),
      img_url: sub.student.imgurl,
    };
  });
  return leaderboard;
}
