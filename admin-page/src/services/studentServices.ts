import { User } from "@/types/user";
import api from "./api";
import { Student } from "@/types/models";

export async function getUserProfile(userId: string): Promise<User> {
  const res = await api.get(`/api/student/profile-admin/${userId}`);

  return res.data.profile;
}

export async function updateUserInfo(student: any) {
  const res = await api.put(`/api/student/${student.student_id}`, { student });

  return res.data;
}

export async function getAllStudents(): Promise<Student[]> {
  const res = await api.get(`/api/student/`);
  const { students }: { students: Student[] } = res.data;
  return students;
}

export async function getGradesAndSchools(): Promise<{ grades: string[]; schools: string[]; cities: string[] }> {
  const res = await api.get(`/api/student/grades-and-schools`);
  return res.data;
}

export async function deleteStudent(studentId: string): Promise<void> {
  await api.delete(`/api/student/${studentId}`);
}
