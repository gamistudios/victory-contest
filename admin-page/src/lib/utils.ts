import { Contest, Submission } from "@/types/models";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import api from "@/services/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

//Contest Actions
export async function deleteContest(contest_id: string) {
  if (!contest_id) {
    throw new Error("Contest ID is missing");
  }
  const res = await api.delete(`/api/contest/delete/${contest_id}`);
  return res.data;
}

export async function getContestById(id: string): Promise<Contest> {
  const res = await api.get(`/api/contest/${id}`);
  return res.data.contest;
}

export async function updateContest(contest: Contest, data: Partial<Contest>) {
  const res = await api.patch(`/api/contest/${contest.id}`, data);
  return res.data;
}

//Action Submission
export async function getSubmissionByContest(
  id: string
): Promise<Submission[]> {
  const res = await api.get(`/api/submission/contest/${id}`);
  const { submissions }: { submissions: Submission[] } = res.data;
  return submissions;
}

//Admin
export async function loginUser(email: string, password: string) {
  const res = await api.post(
    `/api/admin/login`,
    {
      email,
      password,
    },
    { withCredentials: true }
  );
  return res.data;
}

export async function registerUser(data: {
  name: string;
  password: string;
  email: string;
}) {
  // Flat payload matching the backend adminInput binding. NOTE: POST
  // /api/admin/register sits behind the adminAuth cookie middleware, so
  // registering a new admin requires an already-authenticated admin session.
  const res = await api.post(`/api/admin/register`, {
    email: data.email,
    password: data.password,
    name: data.name,
  });
  return res.data;
}

export async function approveAdmin(
  id: string,
  data: { is_approved: boolean }
) {
  // The backend PUT /api/admin/:id now read-modify-writes the row keyed by
  // the admin ID (never an email), with a flat partial-safe body.
  const res = await api.put(`/api/admin/${id}`, {
    is_approved: data.is_approved,
  });
  return res.data;
}

export async function getAllAdmins() {
  const res = await api.get(`/api/admin/`);
  const { admins } = res.data;
  return admins;
}

export async function deleteAdmin(id: string) {
  const res = await api.delete(`/api/admin/${id}`);
  return res.data;
}
