import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely formats a date string to a relative time (e.g., "2 hours ago")
 * @param dateString - The date string to format
 * @param fallback - Fallback text if date is invalid
 * @returns Formatted relative time or fallback text
 */
export function safeFormatDistanceToNow(dateString: string | null | undefined, fallback: string = 'Invalid date'): string {
  try {
    if (!dateString) return fallback;
    
    const parsedDate = parseISO(dateString);
    if (isNaN(parsedDate.getTime())) {
      console.warn('Invalid date string:', dateString);
      return fallback;
    }
    
    return formatDistanceToNow(parsedDate);
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return fallback;
  }
}

/**
 * Safely creates a Date object from a date string
 * @param dateString - The date string to parse
 * @param fallback - Fallback date if parsing fails
 * @returns Date object or fallback
 */
export function safeParseDate(dateString: string | null | undefined, fallback: Date = new Date()): Date {
  try {
    if (!dateString) return fallback;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return fallback;
    }
    
    return date;
  } catch (error) {
    console.warn('Error parsing date:', dateString, error);
    return fallback;
  }
}

/**
 * Safely gets the length of a questions array
 * @param questions - The questions array to check
 * @returns The length of the array or 0 if null/undefined
 */
export function safeQuestionsLength(questions: any[] | null | undefined): number {
  if (!questions || !Array.isArray(questions)) {
    console.warn('Questions is not a valid array:', questions);
    return 0;
  }
  return questions.length;
}

/**
 * Safely accesses a question from an array
 * @param questions - The questions array
 * @param index - The index to access
 * @returns The question at the index or null if invalid
 */
export function safeGetQuestion(questions: any[] | null | undefined, index: number): any {
  if (!questions || !Array.isArray(questions)) {
    console.warn('Questions is not a valid array:', questions);
    return null;
  }
  if (index < 0 || index >= questions.length) {
    console.warn('Question index out of bounds:', index, 'length:', questions.length);
    return null;
  }
  return questions[index];
}
