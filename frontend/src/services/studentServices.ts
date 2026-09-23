import { AuthStudent } from "../types";
import api from "./api";

export async function getUserStat(user_id: string) {
  const res = await api.get(`/submission/statistics-profile/${user_id}`);
  return res.data.stat;
}

export async function getUserProfile(user_id: string) {
  const res = await api.get(`/student/${user_id}`);
  return res.data.student;
}

export async function studentRegister(values: Record<string, unknown>) {
  const res = await api.post("/student/", values);
  return res.data.student;
}

export async function getStudentById(id: string) {
  const res = await api.get(`/student/${id}`);
  return res.data.student;
}
export async function updateUserInfo(user: AuthStudent) {
  const res = await api.put(`/student/${user.id}`, user);
  return res.data;
}

export async function updateStudentDefaultScoreRange(studentId: string, scoreRange: string) {
  // First get the current student data
  const currentStudent = await getStudentById(studentId);

  // Update the student with the new defaultScoreRange
  const updatedStudent = {
    ...currentStudent,
    defaultScoreRange: scoreRange
  };

  // Use the existing update endpoint
  const res = await api.put(`/student/${studentId}`, updatedStudent);
  return res.data;
}
