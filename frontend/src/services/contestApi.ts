import { Contest, LeaderboardEntry } from "../types";
import api from "./api";

export const getAllContests = async (): Promise<Contest[]> => {
  const res = await api.get(`/contest/status/active`);
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
): Promise<any> => {
  const res = await api.post(`/contest-registration/`, {
    contest_id: contestId,
    student_id: studentId,
  });
  return res.data;
};

export const submitContestResult = async (submission: any): Promise<any> => {
  const res = await api.post(`/submission/`, submission);
  return res.data;
};
export const getEditorial = async (
  student_id: string,
  contest_id: string
): Promise<any> => {
  const res = await api.get(
    `/submission/editorial/${student_id}?contest_id=${contest_id}`
  );
  return res.data.editorial;
};
export async function getContestRegistration(contest_id: string): Promise<any> {
  return api
    .get(`/contest-registration/contest/${contest_id}`)
    .then((res) => res.data.registerations);
}
