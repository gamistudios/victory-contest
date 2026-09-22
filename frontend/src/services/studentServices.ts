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

export async function studentRegister(values: any) {
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
  console.log('Updating student default score range:', { studentId, scoreRange });
  
  // First get the current student data
  const currentStudent = await getStudentById(studentId);
  console.log('Current student data:', currentStudent);
  
  // Update the student with the new defaultScoreRange
  const updatedStudent = {
    ...currentStudent,
    defaultScoreRange: scoreRange
  };
  console.log('Updated student data:', updatedStudent);
  
  // Use the existing update endpoint
  const res = await api.put(`/student/${studentId}`, updatedStudent);
  console.log('Update response:', res.data);
  return res.data;
}
