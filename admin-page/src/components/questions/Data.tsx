export const grades = Array.from({ length: 4 }, (_, index) => {
  return `${9 + index}`;
});

export const Subjects = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Aptitude",
  "Math", // Keep the original "Math" for backward compatibility
];

export const chapters = Array.from({ length: 5 }, (_, index) => {
  return `Chapter ${index + 1}`;
});
