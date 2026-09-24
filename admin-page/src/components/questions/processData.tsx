import { Question } from "../../types/models";

function parseQuestionsWithChoices(text: string): Question[] {
  const questions: Question[] = [];
  const lines = text.split("\n");
  console.log(text);

  let currentQuestion: Question | null = null;
  let currentGrade = "";
  let currentSubject = "";
  let currentChapter = "";
  let currentChange = { question: false, choice: false, exp: false };

  lines.forEach((line) => {
    const subjectMatch = line.match(/Subject:\s*(.*)/i);
    const gradeMatch = line.match(/Grade:\s*(\d+)/i);
    const chapterMatch = line.match(/Chapter:\s*(.*)/i);
    const questionMatch = line.match(/^Q\d*\.?\s*(.*)/i);
    const choiceMatch = line.match(/^([A-D])\.\s*(.*)/);
    const answerMatch = line.match(/^Answer:\s*(.*)/);
    const expMatch = line.startsWith("Explanation");

    if (subjectMatch) {
      currentSubject = subjectMatch[1].trim();
    } else if (gradeMatch) {
      currentGrade = gradeMatch[1].trim();
    } else if (chapterMatch) {
      currentChapter = chapterMatch[1].trim();
    } else if (questionMatch) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }

      currentQuestion = {
        question_text: questionMatch[1].trim(),
        multiple_choice: [],
        answer: null,
        explanation: "",
        grade: currentGrade,
        subject: currentSubject,
        chapter: currentChapter,
      };
      currentChange = { question: true, choice: false, exp: false };
    } else if (choiceMatch && currentQuestion) {
      currentQuestion.multiple_choice.push(choiceMatch[2].trim());
      currentChange = { question: false, choice: true, exp: false };
    } else if (answerMatch && currentQuestion) {
      currentQuestion.answer = Number(answerMatch[1].trim());
    } else if (expMatch && currentQuestion) {
      const explanation = line.replace("Explanation:", "").trim();
      currentQuestion.explanation += explanation;
      currentChange = { question: false, choice: false, exp: true };
    } else {
      if (currentQuestion) {
        if (currentChange.question) {
          currentQuestion.question_text += " " + line.trim();
        } else if (currentChange.choice) {
          currentQuestion.multiple_choice[
            currentQuestion.multiple_choice.length - 1
          ] += " " + line.trim();
        } else if (currentChange.exp) {
          currentQuestion.explanation += " " + line.trim();
        }
      }
    }
  });

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  return questions;
}

export function ProcessFile(file: File): Promise<Question[]> {
  if (!file) {
    console.error("Invalid file input.");
    return Promise.reject("Invalid file input.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event: any) => {
      try {
        const text = event.target.result;
        console.log(text);
        const questions = parseQuestionsWithChoices(text);
        // console.log(questions);
        resolve(questions);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => {
      console.error("Error reading file:", error);
      reject(error);
    };

    reader.readAsText(file);
  });
}
