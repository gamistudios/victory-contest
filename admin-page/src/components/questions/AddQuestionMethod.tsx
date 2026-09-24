import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grades, Subjects } from "./Data";
import { ProcessFile } from "./processData";
import { updateQuestion } from "@/lib/utils";
import { Question } from "../../types/models";
import { useSearchParams } from "react-router-dom";
import { addMultipleQuestions, addQuestion } from "@/services/questionServices";
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
  "id" | "answer" | "question_image" | "explanation_image"
> & {
  answer: string;
  question_image?: File | string;
  explanation_image?: File | string;
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
  | { type: "RESET_FORM"; payload: FormState };

// 2. The reducer is now fully type-safe
const formReducer = (state: FormState, action: Action): FormState => {
  switch (action.type) {
    case "UPDATE_FIELD":
      return { ...state, [action.field]: action.value };
    case "ADD_OPTION":
      return { ...state, multiple_choice: [...state.multiple_choice, ""] };
    case "REMOVE_OPTION":
      const newOptions = state.multiple_choice.filter(
        (_, i) => i !== action.index
      );
      const isAnswerRemoved =
        state.answer === state.multiple_choice[action.index];
      return {
        ...state,
        multiple_choice: newOptions,
        answer: isAnswerRemoved ? "" : state.answer,
      };
    case "UPDATE_OPTION":
      const updatedOptions = [...state.multiple_choice];
      updatedOptions[action.index] = action.value;
      return { ...state, multiple_choice: updatedOptions };
    case "RESET_FORM":
      return action.payload;
    default:
      return state;
  }
};

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
        // For editing: create a Question object and call updateQuestion
        console.log("Editing question with ID:", questionToEdit.id);
        console.log("Question to edit:", questionToEdit);

        const questionToUpdate: Question = {
          id: questionToEdit.id,
          question_text: validationResult.data.question_text,
          multiple_choice: validationResult.data.multiple_choice,
          answer: parseInt(validationResult.data.answer),
          grade: validationResult.data.grade,
          subject: validationResult.data.subject,
          chapter: validationResult.data.chapter,
          explanation: validationResult.data.explanation ?? "",
          question_image:
            validationResult.data.question_image?.name || undefined,
          explanation_image:
            validationResult.data.explanation_image?.name || undefined,
        };

        console.log("Question to update:", questionToUpdate);

        const promise = updateQuestion(questionToUpdate);
        toast.promise(promise, {
          loading: "Updating question...",
          success: () => {
            return "Question updated successfully!";
          },
          error: (err: Error) => `Operation failed: ${err.message}`,
          finally: () => setIsLoading(false),
        });
      } else {
        // For adding new question: use FormData and call addQuestion
        const formData: FormData = new FormData();
        Object.entries(validationResult.data).forEach(([key, value]) => {
          if (key === "multiple_choice" && Array.isArray(value)) {
            value.forEach((opt: string) => formData.append(key, opt));
          } else if (value instanceof File) {
            formData.append(key, value);
          } else if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });

        const promise = addQuestion(formData as any);
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ... The rest of your beautiful, clean JSX ... */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8">
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
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Multiple Choice Options</CardTitle>
                <CardDescription>
                  Provide the possible answers. Select the correct one.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
                {state.multiple_choice.map((option, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <RadioGroupItem
                      value={(index + 1).toString()}
                      id={`option-${index}`}
                    />
                    <Label htmlFor={`option-${index}`} className="sr-only">
                      Select option {index + 1}
                    </Label>
                    <Input
                      value={option}
                      placeholder={`Option ${index + 1}`}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_OPTION",
                          index,
                          value: e.target.value,
                        })
                      }
                      className="flex-grow"
                    />
                    {state.multiple_choice.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          dispatch({ type: "REMOVE_OPTION", index })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
          <Button type="submit" disabled={isLoading}>
            {isLoading
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : "Add Question"}
          </Button>
        </div>

        <div className="lg:col-span-1 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>Categorize this question.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["grade", "subject"] as const).map((field) => (
                <div key={field} className="space-y-2">
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

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsFileProcessing(true);

    const promise = ProcessFile(selectedFile);

    toast.promise(promise, {
      loading: "Processing file... This may take a moment.",
      success: (processedQuestions: Question[]) => {
        setQuestions(processedQuestions);
        setCurrentPage(1); // Reset to first page
        return `${processedQuestions.length} questions processed successfully!`;
      },
      error: "Failed to process file. Please check the format.",
      finally: () => setIsFileProcessing(false),
    });
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
    <div className="container mx-auto p-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Bulk Upload Questions
        </h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!file || isFileProcessing || isSubmitting}
          >
            Clear All
          </Button>
          <Button
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
        <CardContent>
          <FileDropzone
            file={file}
            onFileSelect={handleFileSelect}
            onClear={handleClear}
          />
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
}

export function FileDropzone({
  file,
  onFileSelect,
  onClear,
  acceptedFileTypes,
}: FileDropzoneProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect(e.target.files ? e.target.files[0] : null);
  };

  if (file) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
        <div className="flex items-center gap-3">
          <FileIcon className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold text-sm">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(2)} KB
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClear}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <label className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
      <UploadCloud className="w-12 h-12 text-muted-foreground" />
      <p className="mt-4 font-semibold">Click to upload or drag & drop</p>
      <p className="text-sm text-muted-foreground">
        Supports: DOC, DOCX, PDF, TXT
      </p>
      <input
        type="file"
        onChange={handleFileChange}
        accept={acceptedFileTypes || ".doc,.docx,.pdf,.txt"}
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

  const handleFieldChange = (field: keyof Question, value: string | number) => {
    setEditableQuestion((prev) => ({ ...prev, [field]: value }));
  };

  const handleOptionChange = (optionIndex: number, value: string) => {
    const newOptions = [...editableQuestion.multiple_choice];
    newOptions[optionIndex] = value;
    handleFieldChange("multiple_choice", newOptions as any);
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
                <div key={choiceIndex} className="flex items-center gap-2">
                  <RadioGroupItem
                    // CORRECTED: Use the index of the CHOICE
                    value={(choiceIndex + 1).toString()}
                    id={`edit-q${index}-opt${choiceIndex}`}
                  />
                  <Input
                    value={choice}
                    onChange={(e) =>
                      handleOptionChange(choiceIndex, e.target.value)
                    }
                    className="flex-grow"
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
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle className="text-base font-semibold leading-relaxed pr-4">
          {`Q${index + 1}: ${question.question_text}`}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <RadioGroup value={question.answer?.toString() ?? ""} disabled>
          {question.multiple_choice.map((choice, choiceIndex) => (
            <div key={choiceIndex} className="flex items-center space-x-2">
              <RadioGroupItem
                // CORRECTED: Use the index of the CHOICE
                value={(choiceIndex + 1).toString()}
                id={`q${index}-opt${choiceIndex}`}
              />
              <Label htmlFor={`q${index}-opt${choiceIndex}`}>{choice}</Label>
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
