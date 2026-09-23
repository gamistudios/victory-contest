import {
  Contest,
  ContestSubmission,
  LeaderboardEntry,
  SubmissionResult,
} from "../types";
import api from "./api";

export const getAllContests = async (): Promise<Contest[]> => {
  // GET /api/contest/status/active never existed (404); Home splits
  // active/previous client-side by end_time, so the full list is what it needs.
  const res = await api.get(`/contest/`);
  return res.data.contests;
};

export const getContestById = async (
  contestId: string | number
): Promise<Contest> => {
  const res = await api.get(`/contest/${contestId}`);
  return res.data.contest;
};

export const getLeaderboardByContest = async (
  contestId: string | number
): Promise<LeaderboardEntry[]> => {
  const res = await api.get(`/submission/rank/${contestId}`);
  return res.data.rankings;
};

export const isUserRegistered = async (
  contestId: string,
  studentId: string
): Promise<boolean> => {
  const res = await api.get(
    `/contest-registration/check/${studentId}/${contestId}`
  );
  return res.data.is_registered;
};

export const registerForContest = async (
  contestId: string,
  studentId: string
): Promise<unknown> => {
  const res = await api.post(`/contest-registration/`, {
    contest_id: contestId,
    student_id: studentId,
  });
  return res.data;
};

export const submitContestResult = async (
  submission: ContestSubmission
): Promise<SubmissionResult> => {
  // The server grades the answer sheet and returns the OFFICIAL score
  // (README §9 #12); that is what the results screen must show.
  const res = await api.post(`/submission/`, submission);
  return res.data ?? {};
};
export interface EditorialResponse {
  editorial?: unknown[] | null;
  participated?: boolean;
  message?: string;
}
export const getEditorial = async (
  student_id: string,
  contest_id: string
): Promise<EditorialResponse> => {
  const res = await api.get(
    `/submission/editorial/${student_id}?contest_id=${contest_id}`
  );
  return res.data ?? {};
};
export async function getContestRegistration(
  contest_id: string
): Promise<unknown[]> {
  return api
    .get(`/contest-registration/contest/${contest_id}`)
    .then((res) => res.data.registerations);
}
