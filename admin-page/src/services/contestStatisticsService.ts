import api from "./api";

export interface StatisticsFilters {
  gender?: string;
  city?: string;
  school?: string;
  grade?: string;
}

export interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  average_score: number;
}

export interface GenderStatistics {
  male: CategoryStats;
  female: CategoryStats;
}

export interface ScoreDistribution {
  excellent: number;
  good: number;
  average: number;
  poor: number;
}

export interface PerformanceLevels {
  excellent: number;
  good: number;
  average: number;
  fail: number;
}

export interface ContestStatistics {
  contest_id: string;
  contest_title: string;
  total_participants: number;
  passed_count: number;
  failed_count: number;
  pass_rate: number;
  average_score: number;
  total_questions: number;
  gender_stats: GenderStatistics;
  city_stats: Record<string, CategoryStats>;
  school_stats: Record<string, CategoryStats>;
  grade_stats: Record<string, CategoryStats>;
  score_distribution: ScoreDistribution;
  performance_levels: PerformanceLevels;
  generated_at: string;
}

export interface StudentContestPerformance {
  student_id: string;
  student_name: string;
  student_gender: string;
  student_city: string;
  student_school: string;
  student_grade: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  percentage: number;
  performance: string;
  time_spent: string;
  submission_time: string;
}

export interface StudentPerformanceList {
  students: StudentContestPerformance[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ContestStatisticsResponse {
  success: boolean;
  data: ContestStatistics;
  message: string;
}

export interface StudentPerformanceResponse {
  success: boolean;
  data: StudentPerformanceList;
  message: string;
}

// Get comprehensive contest statistics with optional filters
export const getContestStatistics = async (
  contestId: string,
  filters: StatisticsFilters = {}
): Promise<ContestStatistics> => {
  const params = new URLSearchParams();
  
  if (filters.gender) params.append('gender', filters.gender);
  if (filters.city) params.append('city', filters.city);
  if (filters.school) params.append('school', filters.school);
  if (filters.grade) params.append('grade', filters.grade);

  const url = `/api/statistics/contest/${contestId}/statistics`;
  const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;
  
  const response = await api.get(fullUrl);
  return response.data.data;
};

// Get contest summary statistics (no filters)
export const getContestSummary = async (contestId: string): Promise<ContestStatistics> => {
  const response = await api.get(`/api/statistics/contest/${contestId}/statistics/summary`);
  return response.data.data;
};

// Get student performances with pagination and optional filters
export const getStudentPerformances = async (
  contestId: string,
  page: number = 1,
  pageSize: number = 20,
  filters: StatisticsFilters = {}
): Promise<StudentPerformanceList> => {
  const params = new URLSearchParams();
  
  params.append('page', page.toString());
  params.append('page_size', pageSize.toString());
  
  if (filters.gender) params.append('gender', filters.gender);
  if (filters.city) params.append('city', filters.city);
  if (filters.school) params.append('school', filters.school);
  if (filters.grade) params.append('grade', filters.grade);

  const response = await api.get(`/api/statistics/contest/${contestId}/statistics/students?${params.toString()}`);
  return response.data.data;
};

// Export contest statistics as JSON
export const exportContestStatistics = async (
  contestId: string,
  filters: StatisticsFilters = {}
): Promise<void> => {
  const stats = await getContestStatistics(contestId, filters);
  
  const exportData = {
    contest: stats.contest_title,
    generatedAt: new Date().toISOString(),
    statistics: stats,
    filters: filters
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
    type: 'application/json' 
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contest-statistics-${contestId}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
