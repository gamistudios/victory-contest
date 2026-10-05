import { Question } from "@/types/models";
import api from "./api";

// Contract mirrors backend/internal/handler/http/question_handler.go +
// backend/internal/domain/question.go. All routes are admin-gated
// (cookie auth via the shared `api` axios instance).

/** 1-based correct-option index — the canonical convention across the
 *  whole stack; never convert to 0-based here. */
export interface AddQuestionInput {
  question_text: string;
  multiple_choice: string[];
  answer: number | string;
  grade: string;
  subject: string;
  chapter: string;
  explanation?: string;
  question_image?: File;
  explanation_image?: File;
}

/** Presence-aware patch: omitted fields keep their stored values
 *  (backend QuestionPatch uses nil pointers / GetPostForm presence). */
export interface UpdateQuestionInput {
  question_text?: string;
  multiple_choice?: string[];
  answer?: number;
  grade?: string;
  subject?: string;
  chapter?: string;
  explanation?: string;
  /** A string is sent verbatim as the Cloudinary URL in the JSON branch;
   *  a File forces the multipart branch where the backend uploads it. */
  question_image?: File | string;
  explanation_image?: File | string;
}

export interface MutateResult {
  message?: string;
  id?: string;
}

const FILE_FIELDS = ["question_image", "explanation_image"] as const;

/** POST /api/question/add — multipart/form-data.
 *  Backend reads PostForm fields question_text, explanation, subject, grade,
 *  chapter, multiple_choice (repeated), answer (integer string) and FormFile
 *  parts question_image / explanation_image. */
export async function addQuestion(
  input: AddQuestionInput
): Promise<MutateResult> {
  const formData = new FormData();
  formData.append("question_text", input.question_text);
  formData.append("subject", input.subject);
  formData.append("grade", input.grade);
  formData.append("chapter", input.chapter);
  formData.append("answer", String(input.answer));
  if (input.explanation !== undefined && input.explanation !== null) {
    formData.append("explanation", input.explanation);
  }
  input.multiple_choice.forEach((option) => {
    formData.append("multiple_choice", option);
  });
  for (const field of FILE_FIELDS) {
    const file = input[field];
    if (file instanceof File) {
      formData.append(field, file);
    }
  }

  const res = await api.post("/api/question/add", formData);
  return res.data;
}

/** POST /api/question/multiple-add — JSON body matching
 *  domain.MultipleQuestionRequest: { questions: Question[] }.
 *  Image fields must already be Cloudinary URLs; this endpoint does not
 *  accept file uploads. */
export async function addMultipleQuestions(
  questions: Question[]
): Promise<MutateResult> {
  for (const [i, q] of questions.entries()) {
    for (const field of FILE_FIELDS) {
      if ((q[field] as unknown) instanceof File) {
        throw new Error(
          `Bulk add does not support File objects (question ${
            i + 1
          }, "${field}"). Upload images one question at a time via add/edit.`
        );
      }
    }
  }
  const res = await api.post("/api/question/multiple-add", { questions });
  return res.data;
}

/** One image the backend extracted from the uploaded document. `path` is a
 *  server-side temp file the question can be pointed at later; `page` is
 *  1-based (0 when the format has no pages). */
export interface ParsedDocumentImage {
  index: number;
  page: number;
  path: string;
  mime: string;
}

export interface ParsedDocument {
  questions: Question[];
  images: ParsedDocumentImage[];
}

/** POST /api/question/parse-document — uploads a .pdf/.docx/.txt question
 *  bank (or a .txt synthesized from pasted text). mode "ai" (default) has
 *  the configured AI provider structure the extracted text + images into
 *  questions; "text" runs the offline deterministic parser. Nothing is
 *  persisted until /multiple-add is called. */
export async function parseQuestionsDocument(
  file: File,
  mode: "ai" | "text" = "ai"
): Promise<ParsedDocument> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  const res = await api.post("/api/question/parse-document", formData);
  return {
    questions: res.data.questions ?? [],
    images: res.data.images ?? [],
  };
}

/** Extracts the backend error message from an axios error response. */
export function questionApiErrorMessage(err: unknown): string {
  const resp = (err as { response?: { data?: { error?: string } } })?.response;
  return resp?.data?.error ?? "Failed to process file. Please check the format.";
}

/** PATCH /api/question/:id — multipart when new image Files are provided,
 *  JSON otherwise. Only fields present in the input are sent; omitted
 *  fields keep their stored values server-side. */
export async function updateQuestion(
  id: string,
  patch: UpdateQuestionInput
): Promise<MutateResult> {
  if (!id) {
    throw new Error("Question ID is missing for update.");
  }

  const hasFiles = FILE_FIELDS.some((field) => patch[field] instanceof File);

  if (hasFiles) {
    const formData = new FormData();
    if (patch.question_text !== undefined)
      formData.append("question_text", patch.question_text);
    if (patch.explanation !== undefined)
      formData.append("explanation", patch.explanation);
    if (patch.subject !== undefined) formData.append("subject", patch.subject);
    if (patch.grade !== undefined) formData.append("grade", patch.grade);
    if (patch.chapter !== undefined) formData.append("chapter", patch.chapter);
    if (patch.answer !== undefined)
      formData.append("answer", String(patch.answer));
    if (patch.multiple_choice !== undefined) {
      patch.multiple_choice.forEach((option) =>
        formData.append("multiple_choice", option)
      );
    }
    for (const field of FILE_FIELDS) {
      const value = patch[field];
      if (value instanceof File) {
        formData.append(field, value);
      }
    }
    const res = await api.patch(`/api/question/${id}`, formData);
    return res.data;
  }

  // JSON branch: never serialize a File into a Cloudinary URL field — the
  // backend would bind "[object File]" / the file name and corrupt it.
  for (const field of FILE_FIELDS) {
    const value = patch[field];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(
        `Invalid "${field}" value for JSON update: expected a Cloudinary URL string or a File. ` +
          "File objects must be uploaded as multipart form data."
      );
    }
  }

  const body: Record<string, unknown> = {};
  if (patch.question_text !== undefined) body.question_text = patch.question_text;
  if (patch.multiple_choice !== undefined)
    body.multiple_choice = patch.multiple_choice;
  if (patch.answer !== undefined) body.answer = patch.answer;
  if (patch.grade !== undefined) body.grade = patch.grade;
  if (patch.subject !== undefined) body.subject = patch.subject;
  if (patch.chapter !== undefined) body.chapter = patch.chapter;
  if (patch.explanation !== undefined) body.explanation = patch.explanation;
  if (typeof patch.question_image === "string")
    body.question_image = patch.question_image;
  if (typeof patch.explanation_image === "string")
    body.explanation_image = patch.explanation_image;

  const res = await api.patch(`/api/question/${id}`, body, {
    headers: { "Content-Type": "application/json" },
  });
  return res.data;
}

/** DELETE /api/question/delete/:id */
export async function deleteQuestion(id: string): Promise<MutateResult> {
  if (!id) {
    throw new Error("Question ID is missing for deletion.");
  }
  const res = await api.delete(`/api/question/delete/${id}`);
  return res.data;
}

/** Server-side cap per bulk-delete request (question_handler.go maxBulkDeleteIDs). */
export const MAX_BULK_DELETE_IDS = 500;

export interface BulkDeleteFailure {
  id: string;
  error: string;
}

export interface BulkDeleteQuestionsResult {
  deleted: string[];
  failed: BulkDeleteFailure[];
}

/** POST /api/question/multiple-delete — body {"ids": string[]}.
 *  Returns 200 with {"deleted": [...], "failed": [{"id","error"}]}; 400 when
 *  ids is missing/empty, holds a blank or non-string entry, or exceeds
 *  MAX_BULK_DELETE_IDS. Guarded client-side so we never send a doomed request. */
export async function deleteQuestions(
  ids: string[]
): Promise<BulkDeleteQuestionsResult> {
  const clean = ids.filter((id) => typeof id === "string" && id.trim() !== "");
  if (clean.length === 0) {
    throw new Error("Select at least one question to delete.");
  }
  if (clean.length > MAX_BULK_DELETE_IDS) {
    throw new Error(
      `Too many ids: maximum ${MAX_BULK_DELETE_IDS} per request.`
    );
  }

  const res = await api.post("/api/question/multiple-delete", { ids: clean });
  // The backend omits/nulls the slices when a side is empty.
  const data = res.data as {
    deleted?: string[] | null;
    failed?: BulkDeleteFailure[] | null;
  };
  return { deleted: data.deleted ?? [], failed: data.failed ?? [] };
}

/** GET /api/question/ — full question rows including answers/explanations
 *  (admin-only route). Unlike GET /api/contest/:id this never strips
 *  sensitive fields, so use it as the source for admin editing. */
export async function getQuestions(): Promise<Question[]> {
  const res = await api.get("/api/question/");
  const { questions }: { questions: Question[] } = res.data;
  return questions;
}

/** GET /api/question/:id — single full question row for admins. */
export async function getQuestionById(id: string): Promise<Question> {
  const res = await api.get(`/api/question/${id}`);
  const { question }: { question: Question } = res.data;
  return question;
}
