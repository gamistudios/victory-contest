import { Rank } from "@/types/contestTypes";
import api from "./api";
import { APIContest, Contest } from "@/types/models";

export const getContests = async (): Promise<Contest[]> => {
  const response = await api.get("/api/contest/");
  return response.data.contests;
};

export const getContestById = async (id: string): Promise<Contest> => {
  const response = await api.get(`/api/contest/${id}`);
  return response.data.contest as Contest;
};

export const getRankings = async (): Promise<{ leaderboard: Rank[] }> => {
  const res = await api.get("/api/submission/leaderboard?timeFrame=all");
  return res.data;
};

export async function addContest(contest: APIContest) {
  const res = await api.post(`/api/contest/add`, contest);
  return res.data;
}

export async function updateContest(
  contest: Contest,
  updates: Partial<Contest>
) {
  // Transform the updates to match backend expectations
  // The backend expects questions as string[] (question IDs), not Question[] objects
  const transformedUpdates: any = { ...updates };

  // If questions are being updated, ensure they're sent as IDs
  if (updates.questions && Array.isArray(updates.questions)) {
    // Extract question IDs from Question objects
    transformedUpdates.questions = updates.questions
      .map((q) => q.id)
      .filter((id) => id);
    console.log("Transformed questions to IDs:", transformedUpdates.questions);
  }

  // Remove the questions field from updates if it's not being explicitly updated
  // This prevents the backend from overwriting questions
  if (!updates.hasOwnProperty("questions")) {
    delete transformedUpdates.questions;
  }

  console.log("Original updates:", updates);
  console.log("Transformed updates for backend:", transformedUpdates);

  const res = await api.patch(`/api/contest/${contest.id}`, transformedUpdates);
  return res.data;
}

export async function deleteContest(contestId: string) {
  const res = await api.delete(`/api/contest/delete/${contestId}`);
  return res.data;
}

export async function announceContest(
  contest: Contest,
  data: { file: File | null; message: string }
) {
  console.log("announceContest called with data:", data);

  // Ensure we have a message
  const message =
    data.message?.trim() ||
    "🎉 New contest announced! Check it out and register now!";
  console.log("Using message:", message);

  const formData = new FormData();
  formData.append("message", message);
  if (data.file) {
    formData.append("file", data.file);
  }

  // Debug: Log FormData contents
  for (let [key, value] of formData.entries()) {
    console.log(`FormData - ${key}:`, value);
  }

  // Don't set Content-Type manually - let the browser handle it for FormData
  const res = await api.post(`/api/contest/announce/${contest.id}`, formData);
  return res.data;
}

export async function cloneContest(
  contest: Contest,
  info: { title: string; description: string }
) {
  const cloneRequest = {
    title: info.title,
    description: info.description,
  };

  console.log("Attempting to clone contest:", contest.id);
  console.log("Clone request data:", cloneRequest);
  console.log("API URL:", `/api/contest/clone/${contest.id}`);

  try {
    const res = await api.post(
      `/api/contest/clone/${contest.id}`,
      cloneRequest
    );
    console.log("Clone response:", res.data);
    return res.data;
  } catch (error) {
    console.error("Clone error details:", error);
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as any;
      console.error("Response status:", axiosError.response?.status);
      console.error("Response data:", axiosError.response?.data);
    }
    throw error;
  }
}

// Test backend connectivity
export async function testBackendConnection() {
  try {
    const res = await api.get("/api/contest/");
    console.log("Backend connection test successful:", res.status);
    return true;
  } catch (error) {
    console.error("Backend connection test failed:", error);
    return false;
  }
}
