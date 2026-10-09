import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grades, Subjects } from "./Data";
import { Question } from "../../types/models";
import { useSearchParams } from "react-router-dom";
import {
  addMultipleQuestions,
  addQuestion,
  pollParseJob,
  questionApiErrorMessage,
  startParseJob,
  updateQuestion,
  type UpdateQuestionInput,
} from "@/services/questionServices";
import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import { FileIcon, PlusCircle, Trash2, UploadCloud, X } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { Textarea } from "@/components/ui/textarea";

const questionSchema = z.object({
  question_text: z
    .string()
    .min(10, "Question text must be at least 10 characters."),
  multiple_choice: z
    .array(z.string().min(1, "Option cannot be empty."))
    .min(2, "Must have at least two options."),
  answer: z.string().min(1, "You must select a correct answer."),
  grade: z.string().min(1, "Please select a grade."),
  subject: z.string().min(1, "Please select a subject."),
  chapter: z.string().min(1, "Please select a chapter."),
  explanation: z.string().optional(),
  question_image: z.instanceof(File).optional(),
  explanation_image: z.instanceof(File).optional(),
});

type FormState = Omit<
  Question,
  | "id"
  | "answer"
  | "question_image"
  | "explanation_image"
  | "option_images"
> & {
  answer: string;
  question_image?: File | string;
  explanation_image?: File | string;
  // Aligned with multiple_choice: entry i is the File the admin picked for
  // option i (or the stored Cloudinary URL string when editing), or null/
  // undefined when that option stays text-only.
  option_images?: Array<File | string | null>;
};

type Action =
  | {
      type: "UPDATE_FIELD";
      field: keyof FormState;
      value: string | File | null;
    }
  | { type: "ADD_OPTION" }
  | { type: "REMOVE_OPTION"; index: number }
  | { type: "UPDATE_OPTION"; index: number; value: string }
  | { type: "SET_OPTION_IMAGE"; index: number; value: File | null }
  | { type: "RESET_FORM"; payload: FormState };

// 2. The reducer is now fully type-safe
const formReducer = (state: FormState, action: Action): FormState => {
  switch (action.type) {
    case "UPDATE_FIELD":
      return { ...state, [action.field]: action.value };
    case "ADD_OPTION":
      return {
        ...state,
        multiple_choice: [...state.multiple_choice, ""],
        option_images: [...(state.option_images ?? []), null],
      };
    case "REMOVE_OPTION": {
      const newOptions = state.multiple_choice.filter(
        (_, i) => i !== action.index
      );
      const isAnswerRemoved =
        state.answer === state.multiple_choice[action.index];
      const newImages = (state.option_images ?? []).filter(
        (_, i) => i !== action.index
      );
      return {
        ...state,
        multiple_choice: newOptions,
        option_images: newImages,
        answer: isAnswerRemoved ? "" : state.answer,
      };
    }
    case "UPDATE_OPTION": {
      const updatedOptions = [...state.multiple_choice];
      updatedOptions[action.index] = action.value;
      return { ...state, multiple_choice: updatedOptions };
    }
    case "SET_OPTION_IMAGE": {
      const images = [...(state.option_images ?? [])];
      while (images.length < state.multiple_choice.length) {
        images.push(null);
      }
      images[action.index] = action.value;
      return { ...state, option_images: images };
    }
    case "RESET_FORM":
      return action.payload;
    default:
      return state;
  }
};

// Renders one option's photo: a File becomes an object-URL preview (released
// on unmount / change to avoid leaks); a stored Cloudinary URL is shown as-is.
function OptionImagePreview({
  image,
  optionNumber,
}: {
  image: File | string | null | undefined;
  optionNumber: number;
}) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (image instanceof File) {
      const url = URL.createObjectURL(image);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setObjectUrl(null);
  }, [image]);
  const src = objectUrl ?? (typeof image === "string" ? image : null);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={`Option ${optionNumber} preview`}
      className="h-12 w-12 object-cover rounded-md border"
    />
  );
}

export function AddQuestionManual(): JSX.Element {
  const [searchParams] = useSearchParams();

  const isEditing = !!searchParams.get("edit");
  const questionToEdit = React.useMemo(() => {
    const qStr = searchParams.get("question");
    return qStr ? (JSON.parse(qStr) as Question) : null;
  }, [searchParams]);

  const initialState: FormState = {
    question_text: questionToEdit?.question_text ?? "",
    multiple_choice: questionToEdit?.multiple_choice ?? ["", ""],
    answer:
      questionToEdit?.answer !== undefined && questionToEdit?.answer !== null
        ? String(questionToEdit.answer)
        : "",
    grade: questionToEdit?.grade ?? "",
    subject: questionToEdit?.subject ?? "",
    chapter: questionToEdit?.chapter ?? "",
    explanation: questionToEdit?.explanation ?? "",
    question_image: undefined,
    explanation_image: undefined,
    // When editing, carry the stored option-image URLs forward so an
    // untouched option keeps its photo; empty slots are "" so the backend
    // treats them as "no image".
    option_images: questionToEdit
      ? questionToEdit.multiple_choice.map((_, i) =>
          questionToEdit.option_images?.[i] ?? ""
        )
      : undefined,
  };

  const [state, dispatch] = React.useReducer(formReducer, initialState);
  const [isLoading, setIsLoading] = React.useState(false);

  // 3. Event handlers are typed
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "question_image" | "explanation_image"
  ) => {
    dispatch({
      type: "UPDATE_FIELD",
      field,
      value: e.target.files?.[0] ?? null,
    });
  };

  const handleOptionImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    dispatch({
      type: "SET_OPTION_IMAGE",
      index,
      value: e.target.files?.[0] ?? null,
    });
  };

  const clearOptionImage = (index: number) => {
    dispatch({ type: "SET_OPTION_IMAGE", index, value: null });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const validationResult = questionSchema.safeParse(state);
    if (!validationResult.success) {
      validationResult.error.issues.forEach((err) => toast.error(err.message));
      setIsLoading(false);
      return;
    }

    try {
      if (isEditing && questionToEdit?.id) {
        // Presence-aware patch: only fields the admin actually provided are
        // sent; a File image forces the multipart branch in the service,
        // an untouched image field is omitted so the stored URL is kept.
        const patch: UpdateQuestionInput = {
          question_text: validationResult.data.question_text,
          multiple_choice: validationResult.data.multiple_choice,
          answer: parseInt(validationResult.data.answer, 10),
          grade: validationResult.data.grade,
          subject: validationResult.data.subject,
          chapter: validationResult.data.chapter,
          explanation: validationResult.data.explanation ?? "",
        };
        if (validationResult.data.question_image instanceof File) {
          patch.question_image = validationResult.data.question_image;
        }
        if (validationResult.data.explanation_image instanceof File) {
          patch.explanation_image = validationResult.data.explanation_image;
        }
        // Option photos: stored URLs pass through untouched; a File uploads
        // the replacement via the multipart branch in the service.
        if (state.option_images) {
          patch.option_images = state.option_images;
        }

        const promise = updateQuestion(questionToEdit.id, patch);
        toast.promise(promise, {
          loading: "Updating question...",
          success: () => {
            return "Question updated successfully!";
          },
          error: (err: Error) => `Operation failed: ${err.message}`,
          finally: () => setIsLoading(false),
        });
      } else {
        // Adding a new question: the service builds the exact multipart
        // payload the backend /api/question/add handler binds. The schema
        // validates the text fields; option photos live on the form state.
        const input = {
          ...validationResult.data,
          answer: parseInt(validationResult.data.answer, 10),
          option_images: state.option_images,
        };
        const promise = addQuestion(input);
        toast.promise(promise, {
          loading: "Adding question...",
          success: () => {
            return "Question added successfully!";
          },
          error: (err: Error) => `Operation failed: ${err.message}`,
          finally: () => setIsLoading(false),
        });
      }
    } catch (error) {
      toast.error(
        `Operation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ... The rest of your beautiful, clean JSX ... */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-2 min-w-0 space-y-6 lg:space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-[16px] font-bold">
                Question Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="question_text">Question</Label>
                <Textarea
                  id="question_text"
                  placeholder="e.g., What is the powerhouse of the cell?"
                  value={state.question_text}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_FIELD",
                      field: "question_text",
                      value: e.target.value,
                    })
                  }
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="question_image">
                  Question Image (Optional)
                </Label>
                <Input
                  id="question_image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "question_image")}
                  className="w-full min-w-0 text-xs file:max-w-[40%] file:truncate"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">
                  Multiple Choice Options
                </CardTitle>
                <CardDescription>
                  Provide the possible answers. Select the correct one.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => dispatch({ type: "ADD_OPTION" })}
              >
                <PlusCircle className="h-4 w-4 mr-2" /> Add Option
              </Button>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={state.answer}
                onValueChange={(value) =>
                  dispatch({ type: "UPDATE_FIELD", field: "answer", value })
                }
                className="space-y-4"
              >
                {state.multiple_choice.map((option, index) => {
                  const optionImage = state.option_images?.[index] ?? null;
                  return (
                    <div key={index} className="min-w-0">
                      <div className="flex items-center gap-2 sm:gap-4">
                        <RadioGroupItem
                          value={(index + 1).toString()}
                          id={`option-${index}`}
                          className="shrink-0"
                        />
                        <Label htmlFor={`option-${index}`} className="sr-only">
                          Select option {index + 1}
                        </Label>
                        <Input
                          value={option}
                          placeholder={`Option ${index + 1} text`}
                          onChange={(e) =>
                            dispatch({
                              type: "UPDATE_OPTION",
                              index,
                              value: e.target.value,
                            })
                          }
                          className="flex-grow min-w-0"
                        />
                        {state.multiple_choice.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() =>
                              dispatch({ type: "REMOVE_OPTION", index })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {/* Per-option photo: an option can carry a picture
                          instead of (or alongside) its text label. */}
                      <div className="mt-2 ml-6 flex items-center gap-3 flex-wrap">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleOptionImageChange(e, index)
                          }
                          className="w-full sm:w-auto sm:max-w-xs text-xs file:max-w-[35%] file:truncate"
                        />
                        {optionImage ? (
                          <div className="flex items-center gap-2">
                            <OptionImagePreview
                              image={optionImage}
                              optionNumber={index + 1}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => clearOptionImage(index)}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Remove
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Optional photo for this option
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
          <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
            {isLoading
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : "Add Question"}
          </Button>
        </div>

        <div className="lg:col-span-1 min-w-0 space-y-6 lg:space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>Categorize this question.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {(["grade", "subject"] as const).map((field) => (
                  <div key={field} className="space-y-2 min-w-0">
                  <Label className="capitalize">{field}</Label>
                  <Select
                    value={state[field]}
                    onValueChange={(value) =>
                      dispatch({ type: "UPDATE_FIELD", field, value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select a ${field}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {{
                        grade: grades,
                        subject: Subjects,
                      }[field].map((item: string) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="capitalize">Chapter</Label>
                <Input
                  placeholder="e.g., Algebra"
                  value={state.chapter}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_FIELD",
                      field: "chapter",
                      value: e.target.value,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Explanation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="explanation">Explanation Text</Label>
                <Textarea
                  id="explanation"
                  placeholder="Explain why the selected answer is correct."
                  value={state.explanation}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_FIELD",
                      field: "explanation",
                      value: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="explanation_image">
                  Explanation Image (Optional)
                </Label>
                <Input
                  id="explanation_image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "explanation_image")}
                  className="w-full min-w-0 text-xs file:max-w-[40%] file:truncate"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

const ITEMS_PER_PAGE = 5;

export function EnhancedUploadQuestions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pastedText, setPastedText] = useState("");
  const [showPasteInput, setShowPasteInput] = useState(false);
  // AI mode sends the extracted text + images to the configured provider,
  // which handles any document layout; unchecking falls back to the offline
  // deterministic parser.
  const [useAI, setUseAI] = useState(true);

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile || isFileProcessing) return;
    setFile(selectedFile);
    setIsFileProcessing(true);

    // Two phases with distinct feedback: the upload POST (file transfer +
    // server-side extraction) and then the parse job (AI/provider work).
    // The same sonner toast is reused by id across the phases.
    const toastId = toast.loading("Uploading file...");
    try {
      const jobId = await startParseJob(
        selectedFile,
        useAI ? "ai" : "text"
      );
      toast.loading(
        useAI
          ? "Processing file with AI... This can take a couple of minutes."
          : "Parsing file... This may take a moment.",
        { id: toastId }
      );
      const parsed = await pollParseJob(jobId);
      setQuestions(parsed.questions);
      setCurrentPage(1); // Reset to first page
      const imageNote =
        parsed.images.length > 0
          ? ` (${parsed.images.length} images extracted — attach them to questions while reviewing)`
          : "";
      toast.success(
        `${parsed.questions.length} questions processed successfully!${imageNote}`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(questionApiErrorMessage(err), { id: toastId });
    } finally {
      setIsFileProcessing(false);
    }
  };

  const handlePasteParse = () => {
    const text = pastedText.trim();
    if (!text) {
      toast.error("Paste your questions first.");
      return;
    }
    // Reuse the same server parser by sending the pasted text as a .txt file.
    const pastedFile = new File([text], "pasted-questions.txt", {
      type: "text/plain",
    });
    setPastedText("");
    handleFileSelect(pastedFile);
  };
  const handleUpdateQuestion = (
    indexToUpdate: number,
    updatedQuestion: Question
  ) => {
    setQuestions((prevQuestions) =>
      prevQuestions.map((q, i) => (i === indexToUpdate ? updatedQuestion : q))
    );
    toast.success("Question updated locally. Remember to submit all changes.");
  };

  const handleClear = () => {
    setFile(null);
    setQuestions([]);
  };

  const handleSubmit = async () => {
    if (questions.length === 0) {
      toast.error(
        "No questions to submit. Please upload and process a file first."
      );
      return;
    }
    setIsSubmitting(true);
    const promise = addMultipleQuestions(questions);

    toast.promise(promise, {
      loading: "Submitting questions to the database...",
      success: () => {
        handleClear(); // Clear state on success
        return "All questions added successfully!";
      },
      error: "An error occurred while submitting questions.",
      finally: () => setIsSubmitting(false),
    });
  };

  // Pagination Logic
  const totalPages = Math.ceil(questions.length / ITEMS_PER_PAGE);
  const currentQuestions = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return questions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [questions, currentPage]);

  return (
    <div className="container mx-auto p-2 sm:p-4 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Bulk Upload Questions
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={handleClear}
            disabled={!file || isFileProcessing || isSubmitting}
          >
            Clear All
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={handleSubmit}
            disabled={
              questions.length === 0 || isFileProcessing || isSubmitting
            }
          >
            {isSubmitting
              ? "Submitting..."
              : `Submit ${questions.length} Questions`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>
            Select a file containing questions. The system will automatically
            process and list them for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              disabled={isFileProcessing}
              className="h-4 w-4"
            />
            Parse with AI (recommended — handles any document layout and tags
            the answers; needs a configured AI provider, otherwise uncheck for
            the offline parser)
          </label>
          <FileDropzone
            file={file}
            onFileSelect={handleFileSelect}
            onClear={handleClear}
            disabled={isFileProcessing}
          />
          <div>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowPasteInput((v) => !v)}
            >
              {showPasteInput
                ? "Hide pasted text input"
                : "Or paste questions as plain text"}
            </button>
            {showPasteInput && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={
                    "Subject: Chemistry\nGrade: 9\nChapter: Atomic Structure\nQ1. What is ...?\nA. ...\nB. ...\nAnswer: 2\nExplanation: ..."
                  }
                  className="min-h-[160px] font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePasteParse}
                  disabled={isFileProcessing || isSubmitting}
                >
                  {isFileProcessing ? "Processing..." : "Parse Pasted Text"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processed Questions</CardTitle>
            <CardDescription>
              Review the questions below. You can edit individual questions or
              submit them all at once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* UPDATED: Pass the new prop to QuestionItem */}
            {currentQuestions.map((q, i) => {
              const originalIndex = (currentPage - 1) * ITEMS_PER_PAGE + i;
              return (
                <QuestionItem
                  key={originalIndex}
                  question={q}
                  index={originalIndex}
                  onUpdateQuestion={handleUpdateQuestion}
                />
              );
            })}
          </CardContent>
          {totalPages > 1 && (
            <Pagination className="p-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>
                {[...Array(totalPages)].map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink
                      href="#"
                      isActive={currentPage === i + 1}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </Card>
      )}
    </div>
  );
}

interface FileDropzoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onClear: () => void;
  acceptedFileTypes?: string;
  /** While a parse is running, drops and new selections are ignored. */
  disabled?: boolean;
}

export function FileDropzone({
  file,
  onFileSelect,
  onClear,
  acceptedFileTypes,
  disabled,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect(e.target.files ? e.target.files[0] : null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileSelect(dropped);
  };

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border rounded-lg bg-muted/20 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <FileIcon className="h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(2)} KB
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClear}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <label
      className={`flex flex-col items-center justify-center w-full max-w-full p-6 sm:p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-center ${
        isDragging
          ? "border-primary bg-primary/10"
          : "border-muted hover:bg-muted/50"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <UploadCloud className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground" />
      <p className="mt-4 font-semibold">
        {isDragging ? "Drop the file to upload" : "Click to upload or drag & drop"}
      </p>
      <p className="text-sm text-muted-foreground">
        Supports: DOCX, PDF, TXT
      </p>
      <input
        type="file"
        onChange={handleFileChange}
        accept={acceptedFileTypes || ".docx,.pdf,.txt"}
        className="hidden"
      />
    </label>
  );
}

interface QuestionItemProps {
  question: Question;
  index: number;
  onUpdateQuestion: (index: number, updatedQuestion: Question) => void;
}

export function QuestionItem({
  question,
  index,
  onUpdateQuestion,
}: QuestionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableQuestion, setEditableQuestion] = useState<Question>(question);

  const handleFieldChange = (
    field: keyof Question,
    value: string | number | string[]
  ) => {
    setEditableQuestion((prev) => ({ ...prev, [field]: value }));
  };

  const handleOptionChange = (optionIndex: number, value: string) => {
    const newOptions = [...editableQuestion.multiple_choice];
    newOptions[optionIndex] = value;
    handleFieldChange("multiple_choice", newOptions);
  };

  const handleSave = () => {
    onUpdateQuestion(index, editableQuestion);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditableQuestion(question); // Reset changes
    setIsEditing(false);
  };

  if (isEditing) {
    // EDIT MODE UI
    return (
      <Card className="bg-muted/30 border-primary/50 border-2">
        <CardHeader>
          <Label htmlFor={`qtext-${index}`} className="text-sm font-semibold">
            Question Text
          </Label>
          <Textarea
            id={`qtext-${index}`}
            value={editableQuestion.question_text}
            onChange={(e) => handleFieldChange("question_text", e.target.value)}
            className="text-base"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">
              Options & Correct Answer
            </Label>
            <RadioGroup
              // The 'answer' is a number, so convert it to a string for the RadioGroup
              value={editableQuestion.answer?.toString() ?? ""}
              onValueChange={(value: string) =>
                handleFieldChange("answer", parseInt(value, 10))
              } // Use the new handler
              className="mt-2 space-y-2"
            >
              {editableQuestion.multiple_choice.map((choice, choiceIndex) => (
                <div key={choiceIndex} className="flex items-center gap-2 min-w-0">
                  <RadioGroupItem
                    // CORRECTED: Use the index of the CHOICE
                    value={(choiceIndex + 1).toString()}
                    id={`edit-q${index}-opt${choiceIndex}`}
                    className="shrink-0"
                  />
                  <Input
                    value={choice}
                    onChange={(e) =>
                      handleOptionChange(choiceIndex, e.target.value)
                    }
                    className="flex-grow min-w-0"
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor={`exp-${index}`} className="text-sm font-semibold">
              Explanation
            </Label>
            <Textarea
              id={`exp-${index}`}
              value={editableQuestion.explanation}
              onChange={(e) => handleFieldChange("explanation", e.target.value)}
              placeholder="Provide an explanation for the correct answer..."
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </CardFooter>
      </Card>
    );
  }

  // VIEW MODE UI (Original Component)
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold leading-relaxed min-w-0 flex-1 break-words">
          {`Q${index + 1}: ${question.question_text}`}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setIsEditing(true)}
        >
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <RadioGroup value={question.answer?.toString() ?? ""} disabled>
          {question.multiple_choice.map((choice, choiceIndex) => (
            <div key={choiceIndex} className="flex items-center space-x-2 min-w-0">
              <RadioGroupItem
                // CORRECTED: Use the index of the CHOICE
                value={(choiceIndex + 1).toString()}
                id={`q${index}-opt${choiceIndex}`}
                className="shrink-0"
              />
              <Label htmlFor={`q${index}-opt${choiceIndex}`} className="min-w-0 break-words text-left">
                {choice}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {question.explanation && (
          <Accordion type="single" collapsible className="w-full mt-4">
            <AccordionItem value="explanation">
              <AccordionTrigger>View Explanation</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {question.explanation}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
