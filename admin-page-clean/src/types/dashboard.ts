// Dashboard API Response Types

export interface DashboardStatsResponse {
  overview: OverviewStats;
  user_stats: UserStats;
  contest_stats: ContestStats;
  page_view_stats: PageViewStats;
  recent_activity: RecentContest[];
  // Additive deep-system stats (client task 4): the question bank and the
  // payments ledger, plus when the aggregate was computed.
  question_stats: QuestionStats;
  payment_stats: PaymentStats;
  generated_at: string;
}

export interface OverviewStats {
  total_users: StatWithTrend;
  total_contests: StatWithTrend;
  revenue: StatWithTrend;
  registrations: StatWithTrend;
}

export interface StatWithTrend {
  value: string;
  trend: "up" | "down" | "neutral";
  change: string;
  data: number[];
}

export interface UserStats {
  by_city: CityDistribution[];
  by_gender: GenderDistribution;
  by_grade: GradeDistribution[];
  growth_trend: number[];
}

export interface CityDistribution {
  city: string;
  count: number;
  percentage: number;
}

export interface GenderDistribution {
  male: number;
  female: number;
  other: number;
  // Added by issue #5: students whose gender is empty/malformed. Every student
  // lands in exactly one bucket, so male+female+other+unknown == total.
  unknown?: number;
}

export interface GradeDistribution {
  grade: string;
  count: number;
  percentage: number;
}

export interface ContestStats {
  participation_data: number[];
  status_distribution: StatusStats;
  subject_distribution: SubjectStat[];
}

export interface StatusStats {
  active: number;
  completed: number;
  upcoming: number;
}

export interface SubjectStat {
  subject: string;
  count: number;
  percentage: number;
}

export interface RecentContest {
  id: string;
  title: string;
  status: "Online" | "Offline";
  users: number;
  subject: string;
  noquestion: number;
  totaltime: string;
  date: string;
}

export interface PageViewStats {
  total_views: number;
  unique_visitors: number;
  views_by_page: Record<string, number>;
  views_by_day: number[];
  top_pages: PageViewSummary[];
}

export interface PageViewSummary {
  page: string;
  views: number;
  percentage: number;
}

// Question-bank stats (client task 4).
export interface QuestionStats {
  total: number;
  by_subject: SubjectStat[];
  by_grade: GradeDistribution[];
  with_explanation: number;
  with_image: number;
}

// Payments-ledger stats (client task 4).
export interface PaymentStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  approved_revenue: number;
  by_status: PaymentStatusStat[];
  trend: number[];
}

export interface PaymentStatusStat {
  status: string;
  count: number;
  percentage: number;
}
