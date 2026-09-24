import { ExtendedContestSubmission, Student } from "../types/models";

export function filterStudentByCityAndGrade(arr: Student[], value: any) {
  const {
    selectedCity: city,
    selectedGrade: grade,
    selectedSchool: school,
  } = value;
  const result: Student[] = arr.filter((student) => {
    return (
      (student.city == city || city == "default") &&
      (student.grade == grade || grade == "default") &&
      (student.school == school || school == "default")
    );
  });
  return result;
}

export function filterContestByStudentData(
  arr: ExtendedContestSubmission[],
  value: any
) {
  const { city, school } = value;
  const result: ExtendedContestSubmission[] = arr.filter((data) => {
    return (
      (data.city == city || city == "default") &&
      (data.school == school || school == "default")
    );
  });

  return result;
}
