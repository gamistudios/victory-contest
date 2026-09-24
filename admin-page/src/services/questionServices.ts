import { Question } from "@/types/models";
import api from "./api";

export async function addQuestion(questionForm: FormData) {
  console.log("hello from questionServices", questionForm);
  const res = await api.post("/api/question/add", questionForm);
  return res.data;
}

export async function addMultipleQuestions(questions: Question[]) {
  const res = await api.post("/api/question/multiple-add", {
    questions: questions,
  });
  return res.data;
}
