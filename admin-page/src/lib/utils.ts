import { Contest, Question, Submission } from "@/types/models";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import api from "@/services/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

//Student Action
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

export async function getQuestions() {
  const res = await api.get(`/api/question/`);
  const { questions } = res.data;
  return questions;
}

export async function addQuestion(question: Question) {
  const res = await api.post(`/api/question/addquestion`, {
    question,
  });
  return res.data;
}

export async function addMultipleQuestions(questions: Question[]) {
  const results = [];
  for (const question of questions) {
    try {
      const formData = new FormData();
      Object.entries(question).forEach(([key, value]) => {
        if (key === "multiple_choice" && Array.isArray(value)) {
          value.forEach((v) => {
            if (v !== null && v !== undefined) {
              formData.append(`multiple_choice`, v.toString());
            }
          });
        } else if (value !== null && value !== undefined) {
          if (key === "question_image" && value instanceof File) {
            formData.append("question_image", value);
          } else if (key === "explanation_image" && value instanceof File) {
            formData.append("explanation_image", value);
          } else {
            formData.append(key, value.toString());
          }
        }
      });

      const res = await api.post(`/api/question/addquestion`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      results.push(res.data);
    } catch (error) {
      results.push({ status: "failed", error: error });
    }
  }
  return results;
}

export async function updateQuestion(question: Question) {
  console.log("updateQuestion called with:", question);

  if (!question.id) {
    console.error("Question ID is missing:", question);
    throw new Error("Question ID is missing for update.");
  }

  // Check if there are any File objects (images) that need FormData
  const hasFiles =
    question.question_image instanceof File ||
    question.explanation_image instanceof File;
  console.log("Has files:", hasFiles);

  if (hasFiles) {
    // Use FormData for file uploads
    console.log("Using FormData for file uploads");
    const formData = new FormData();
    Object.entries(question).forEach(([key, value]) => {
      if (key === "multiple_choice" && Array.isArray(value)) {
        value.forEach((v) => {
          if (v !== null && v !== undefined) {
            formData.append(`multiple_choice`, v.toString());
          }
        });
      } else if (value !== null && value !== undefined && key !== "id") {
        if (value instanceof File) {
          formData.append(key, value);
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    console.log("FormData entries:");
    for (const [key, value] of formData.entries()) {
      console.log(key, value);
    }

    const res = await api.patch(`/api/question/${question.id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  } else {
    // Use JSON for text-only updates
    console.log("Using JSON for text-only updates");
    const updateData = {
      question_text: question.question_text,
      multiple_choice: question.multiple_choice,
      answer: question.answer,
      grade: question.grade,
      subject: question.subject,
      chapter: question.chapter,
      explanation: question.explanation,
      question_image: question.question_image,
      explanation_image: question.explanation_image,
    };

    console.log("JSON update data:", updateData);

    const res = await api.patch(`/api/question/${question.id}`, updateData, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    return res.data;
  }
}

export async function deleteQusetion(id: string) {
  const res = await api.delete(`/api/question/delete/${id}`);
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
  const res = await api.post(`/api/admin/register`, {
    data,
  });
  return res.data;
}

export async function approveAdmin(
  email: string,
  data: { isApproved: boolean }
) {
  const res = await api.put(`/api/admin/${email}`, { data });
  return res.data;
}

export async function getAllAdmins() {
  const res = await api.get(`/api/admin/`);
  const { admins } = res.data;
  return admins;
}

export async function deleteAdmin(email: string) {
  const res = await api.delete(`/api/admin/${email}`);
  return res.data;
}
