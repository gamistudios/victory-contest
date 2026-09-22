import React, { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import { UserStats } from "../types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  BarChart3,
  Target,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Lightbulb,
  BookOpen,
  Award,
  Zap,
  Brain,
  ChevronDown,
  Check,
  Sparkles,
  Loader2,
  MessageSquare,
  Play,
  Lock,
} from "lucide-react";
import api from "../services/api";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { getAiRecommendationsFromApi } from "../services/aiService";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import TimeIcon from "../assets/timer-02-stroke-rounded.svg?react";
const Statistics: React.FC = () => {
  const { user: tgUser } = useTelegram();
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [selectedFilter, setSelectedFilter] = useState<
    "subjects" | "chapters" | "grades"
  >("subjects");
  const [aiRecommendations, setAiRecommendations] = useState<{
    [key: string]: {
      loading: boolean;
      recommendations: string[];
      strategies: string[];
      resources: Array<{
        name: string;
        topic: string;
        type: string;
        platform: string;
      }>;
      practicePlan: Array<{
        timeframe: string;
        focus: string;
      }>;
    };
  }>({});
  const [showRecommendations, setShowRecommendations] = useState<{
    [key: string]: boolean;
  }>({});

  useEffect(() => {
    if (!tgUser?.id) {
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/submission/statistics/${tgUser.id}`);
        if (res.data && res.data.statistics) {
          setStats(res.data.statistics);
        } else {
          setError("Invalid statistics data format");
        }
        // const mockStat = {
        //   total_contests: 15,
        //   total_questions: 350,
        //   correct_answers: 280,
        //   accuracy: 0.8,
        //   average_time: 45.5,
        //   subjects: {
        //     Mathematics: {
        //       total: 150,
        //       correct: 110,
        //       accuracy: 0.733,
        //     },
        //     Physics: {
        //       total: 100,
        //       correct: 90,
        //       accuracy: 0.9,
        //     },
        //     Chemistry: {
        //       total: 100,
        //       correct: 80,
        //       accuracy: 0.8,
        //     },
        //   },
        //   chapters: {
        //     Algebra: {
        //       total: 75,
        //       correct: 50,
        //       accuracy: 0.667,
        //     },
        //     Kinematics: {
        //       total: 50,
        //       correct: 48,
        //       accuracy: 0.96,
        //     },
        //     Stoichiometry: {
        //       total: 60,
        //       correct: 45,
        //       accuracy: 0.75,
        //     },
        //   },
        //   grades: {
        //     "Grade 9": {
        //       total: 100,
        //       correct: 85,
        //       accuracy: 0.85,
        //     },
        //     "Grade 10": {
        //       total: 120,
        //       correct: 95,
        //       accuracy: 0.792,
        //     },
        //     "Grade 11": {
        //       total: 130,
        //       correct: 100,
        //       accuracy: 0.769,
        //     },
        //   },
        //   performance_trend: [
        //     {
        //       month: "May",
        //       accuracy: 0.75,
        //       questions: 100,
        //     },
        //     {
        //       month: "June",
        //       accuracy: 0.82,
        //       questions: 120,
        //     },
        //     {
        //       month: "July",
        //       accuracy: 0.81,
        //       questions: 130,
        //     },
        //   ],
        // };
        // setStats(mockStat);
      } catch (err) {
        setError("Failed to fetch statistics");
        console.error("Error fetching statistics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [tgUser]);

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return "#10b981"; // green
    if (accuracy >= 80) return "#3b82f6"; // blue
    if (accuracy >= 70) return "#f59e0b"; // yellow
    return "#ef4444"; // red
  };

  const getImprovementAreas = () => {
    if (!stats) return [];

    const allData = [
      ...Object.entries(stats.subjects || {}).map(([name, data]) => ({
        name,
        ...data,
        type: "Subject",
      })),
    ]
      .filter((item) => item.accuracy < 85)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    return allData;
  };

  const getStrengths = () => {
    if (!stats) return [];

    const allData = [
      ...Object.entries(stats.subjects || {}).map(([name, data]) => ({
        name,
        ...data,
        type: "Subject",
      })),
    ]
      .filter((item) => item.accuracy >= 85)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5);

    return allData;
  };

  const getPerformanceTrend = () => {
    if (!stats || !stats.performance_trend) return [];
    return stats.performance_trend.map(
      (item: { month: string; accuracy: number; questions: number }) => ({
        month: item.month,
        accuracy: item.accuracy,
        questions: item.questions,
      })
    );
  };

  const getRadarData = () => {
    if (!stats) return [];

    const mainSubjects = Object.keys(stats.subjects);

    return mainSubjects.map((subject) => ({
      subject,
      accuracy: stats.subjects?.[subject]?.accuracy || 0,
      fullMark: 100,
    }));
  };

  const getChartData = () => {
    if (!stats) return [];

    const dataMap = {
      subjects: stats.subjects || {},
      chapters: stats.chapters || {},
      grades: stats.grades || {},
    };

    return Object.entries(dataMap[selectedFilter])
      .map(([key, value]) => ({
        name: key.length > 10 ? `${key.substring(0, 8)}...` : key,
        fullName: key,
        accuracy: value.accuracy,
        correct: value.correct,
        total: value.total,
        incorrect: value.total - value.correct,
      }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 10);
  };

  const getPieData = () => {
    return getChartData().map((item) => ({
      name: item.name,
      value: item.accuracy,
      color: getAccuracyColor(item.accuracy),
    }));
  };

  const getAiRecommendations = async (subjectName: string) => {
    if (aiRecommendations[subjectName]?.recommendations.length > 0) {
      setShowRecommendations((prev) => ({
        ...prev,
        [subjectName]: !prev[subjectName],
      }));
      return;
    }

    setAiRecommendations((prev) => ({
      ...prev,
      [subjectName]: {
        ...prev[subjectName],
        loading: true,
      },
    }));

    try {
      const recommendation = await getAiRecommendationsFromApi({
        subject: subjectName,
        chapters: stats?.chapters,
      });
      setAiRecommendations((prev) => ({
        ...prev,
        [subjectName]: {
          loading: false,
          ...recommendation,
        },
      }));

      setShowRecommendations((prev) => ({
        ...prev,
        [subjectName]: true,
      }));
    } catch (error) {
      console.error("Error fetching AI recommendations:", error);
      setAiRecommendations((prev) => ({
        ...prev,
        [subjectName]: {
          loading: false,
          recommendations: [
            "Failed to load recommendations. Please try again.",
          ],
          strategies: [],
          resources: [],
          practicePlan: [],
        },
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <div className="text-lg mb-2">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <div className="text-2xl mb-2">No statistics available yet.</div>
        <div className="text-sm">
          Participate in contests to see your statistics!
        </div>
      </div>
    );
  }

  const chartData = getChartData();
  const pieData = getPieData();
  const performanceTrend = getPerformanceTrend();
  const radarData = getRadarData();
  const improvementAreas = getImprovementAreas();
  const strengths = getStrengths();
  const filterOptions = ["subjects", "chapters", "grades"] as const;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Performance Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-8 h-8 text-blue-500" />
            <div className="flex items-center text-green-500">
              <ArrowUp size={16} />
              <span className="text-sm font-medium">+12%</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 dark:text-white">
            {stats.total_contests}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total Contests
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 text-green-500" />
            <div className="flex items-center text-green-500">
              <ArrowUp size={16} />
              <span className="text-sm font-medium">+5%</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 dark:text-white">
            {stats.accuracy}%
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Overall Accuracy
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <TimeIcon className="w-8 h-8 text-purple-500" />
            <div className="flex items-center text-red-500">
              <ArrowDown size={16} />
              <span className="text-sm font-medium">-3s</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 dark:text-white">
            {stats.average_time}s
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Avg. Response Time
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-orange-500" />
            <div className="flex items-center text-green-500">
              <ArrowUp size={16} />
              <span className="text-sm font-medium">+28</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 dark:text-white">
            {stats.correct_answers}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Correct Answers
          </div>
        </div>
      </div>

      {/* Performance Trend Chart */}
      {performanceTrend.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-blue-500" />
            Performance Trend (Last 6 Months)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTrend}>
                <defs>
                  <linearGradient
                    id="colorAccuracy"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" />
                <YAxis stroke="#6b7280" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  formatter={(value) => [`${value}%`, "Accuracy"]}
                />
                <Area
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAccuracy)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Subject Performance Radar */}
      {radarData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <Brain className="w-5 h-5 mr-2 text-purple-500" />
            Core Subject Performance
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                />
                <Radar
                  name="Accuracy"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  formatter={(value) => [`${value}%`, "Accuracy"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Performance Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
              Performance by{" "}
              {selectedFilter.charAt(0).toUpperCase() + selectedFilter.slice(1)}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-between border-2 bg-white hover:bg-gray-700 dark:bg-gray-800 "
                >
                  {/* Display the currently selected filter */}
                  {selectedFilter.charAt(0).toUpperCase() +
                    selectedFilter.slice(1)}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[150px] bg-white dark:bg-gray-800">
                {filterOptions.map((filter) => (
                  <DropdownMenuItem
                    key={filter}
                    onSelect={() => setSelectedFilter(filter)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedFilter === filter ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis stroke="#6b7280" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  formatter={(value, name) => [
                    name === "accuracy" ? `${value}%` : value,
                    name === "accuracy"
                      ? "Accuracy"
                      : name === "correct"
                      ? "Correct"
                      : "Incorrect",
                  ]}
                  labelFormatter={(label) =>
                    chartData.find((item) => item.name === label)?.fullName ||
                    label
                  }
                />
                <Bar dataKey="accuracy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2 text-green-500" />
            Accuracy Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`
                  }
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  formatter={(value) => [`${value}%`, "Accuracy"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Areas for Improvement*/}
      <div className="grid md:grid-cols-2 gap-6">
        {
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
              Areas for Improvement
            </h3>
            <div className="space-y-3">
              {improvementAreas.map((area, index) => (
                <div
                  key={area.name}
                  className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                        <span className="text-orange-600 dark:text-orange-400 font-bold text-sm">
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white">
                          {area.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {area.correct}/{area.total} correct • {area.type}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                        {area.accuracy}%
                      </div>
                      <div className="text-xs text-gray-500">Accuracy</div>
                    </div>
                  </div>

                  {/* AI Recommendation Button */}
                  <div className="mt-3">
                    {!user?.is_premium ? (
                      <Button
                        onClick={() => navigate("/payment")}
                        className="w-full bg-gradient-to-r from-orange-300 to-red-400 hover:from-orange-600 hover:to-red-600 text-white border-0"
                      >
                        <Lock className="w-4 h-4 mr-2 " />
                        Get AI Recommendations
                      </Button>
                    ) : (
                      <Button
                        onClick={() => getAiRecommendations(area.name)}
                        disabled={aiRecommendations[area.name]?.loading}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
                      >
                        {aiRecommendations[area.name]?.loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Getting AI Recommendations...
                          </>
                        ) : showRecommendations[area.name] ? (
                          <>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Hide AI Recommendations
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Get AI Recommendations
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* AI Recommendations Display */}
                  {showRecommendations[area.name] &&
                    aiRecommendations[area.name] && (
                      <div className="mt-4 space-y-4">
                        {/* Recommendations */}
                        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-800 dark:text-white mb-2 flex items-center">
                            <Lightbulb className="w-4 h-4 mr-2 text-yellow-500" />
                            Key Recommendations
                          </h4>
                          <ul className="space-y-2">
                            {aiRecommendations[area.name].recommendations.map(
                              (rec, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start space-x-2 text-sm text-gray-700 dark:text-gray-300"
                                >
                                  <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                                  <span>{rec}</span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>

                        {/* Strategies */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-800 dark:text-white mb-2 flex items-center">
                            <Brain className="w-4 h-4 mr-2 text-blue-500" />
                            Study Strategies
                          </h4>
                          <ul className="space-y-2">
                            {aiRecommendations[area.name].strategies.map(
                              (strategy, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start space-x-2 text-sm text-gray-700 dark:text-gray-300"
                                >
                                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                                  <span>{strategy}</span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>

                        {/* Resources */}
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-800 dark:text-white mb-2 flex items-center">
                            <BookOpen className="w-4 h-4 mr-2 text-green-500" />
                            Recommended Resources
                          </h4>
                          <div className="space-y-3">
                            {aiRecommendations[area.name].resources.map(
                              (resource, idx) => (
                                <div
                                  key={idx}
                                  className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-800 dark:text-white text-sm">
                                        {resource.name}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        Topic: {resource.topic} • Type:{" "}
                                        {resource.type}
                                      </div>
                                    </div>
                                    <div className="ml-2">
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                        {resource.platform}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>

                        {/* Practice Plan */}
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-800 dark:text-white mb-2 flex items-center">
                            <Play className="w-4 h-4 mr-2 text-purple-500" />
                            Practice Plan
                          </h4>
                          <div className="space-y-3">
                            {aiRecommendations[area.name].practicePlan.map(
                              (step, idx) => (
                                <div
                                  key={idx}
                                  className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3"
                                >
                                  <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                      <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                                        <span className="text-purple-600 dark:text-purple-400 text-xs font-bold">
                                          {idx + 1}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="font-medium text-purple-800 dark:text-purple-300 text-sm">
                                        {step.timeframe}
                                      </div>
                                      <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                        {step.focus}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="flex items-start space-x-2">
                <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                    Recommendation
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-400">
                    Focus on practicing {improvementAreas[0]?.name} questions.
                    Consider reviewing fundamental concepts and taking practice
                    tests.
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        {strengths.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
              Your Strengths
            </h3>
            <div className="space-y-3">
              {strengths.map((strength) => (
                <div
                  key={strength.name}
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-xl"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <Award className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-800 dark:text-white">
                        {strength.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {strength.correct}/{strength.total} correct •{" "}
                        {strength.type}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {strength.accuracy}%
                    </div>
                    <div className="text-xs text-gray-500">Accuracy</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <div className="flex items-start space-x-2">
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <div className="font-medium text-green-800 dark:text-green-300 mb-1">
                    Keep it up!
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-400">
                    You're excelling in {strengths[0]?.name}. Use this strength
                    to tackle more challenging problems in this area.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Study Plan Recommendations */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
          <BookOpen className="w-5 h-5 mr-2 text-blue-500" />
          Personalized Study Plan
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-xl">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
              This Week
            </div>
            <div className="text-gray-800 dark:text-white font-medium mb-1">
              Focus on {improvementAreas[0]?.name || "your weakest area"}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Practice 15-20 questions daily
            </div>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-xl">
            <div className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2">
              Next Week
            </div>
            <div className="text-gray-800 dark:text-white font-medium mb-1">
              Review {improvementAreas[1]?.name || "another weak area"}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Take 2 practice tests
            </div>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-xl">
            <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
              Goal
            </div>
            <div className="text-gray-800 dark:text-white font-medium mb-1">
              Reach 90% Accuracy
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              In your weak areas
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
