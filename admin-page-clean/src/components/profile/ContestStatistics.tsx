import { SubjectAnalysis, GradeAnalysis, UserStats } from "@/types/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LineChart,
  Line,
} from "recharts";
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Target,
} from "lucide-react";

interface ContestStatisticsProps {
  // From GET /api/submission/statistics/:id; undefined while loading or when
  // the request failed — every chart then renders its empty state.
  stat?: UserStats;
}
export function ContestStatistics({ stat }: ContestStatisticsProps) {
  // ## Refactored Data Transformation Functions ##

  // Transforms subject statistics into the chart/table format.
  const getSubjectAnalysis = (): SubjectAnalysis[] => {
    if (!stat?.subjects) return [];

    return Object.entries(stat.subjects).map(([subject, data]) => ({
      subject,
      totalQuestions: data.total,
      correctAnswers: data.correct,
      missedQuestions: data.total - data.correct,
      accuracy: Math.round(data.accuracy || 0),
    }));
  };

  // Transforms grade statistics into the chart format.
  const getGradeAnalysis = (): GradeAnalysis[] => {
    if (!stat?.grades) return [];

    return Object.entries(stat.grades).map(([grade, data]) => ({
      grade: Number(grade),
      totalQuestions: data.total,
      correctAnswers: data.correct,
      missedQuestions: data.total - data.correct,
      accuracy: Math.round(data.accuracy || 0),
    }));
  };

  // Process data for the charts
  const subjectAnalysis = getSubjectAnalysis();
  const gradeAnalysis = getGradeAnalysis();

  const subjectColors = [
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
  ];

  // Data for the 'Missed Questions' pie chart
  const pieData = subjectAnalysis.map((item, index) => ({
    name: item.subject,
    value: item.missedQuestions,
    color: subjectColors[index % subjectColors.length],
  }));

  // Data for the 'Performance Trends' line chart
  const performanceTrendData =
    stat?.performance_trend?.map((trend) => ({
      month: trend.month.substring(0, 3), // Abbreviate month name
      accuracy: Math.round(trend.accuracy || 0),
    })) || [];

  // ## Component Return ##
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-100 bg-gray-50">
        <CardTitle className="flex items-center space-x-3 text-gray-900 min-w-0">
          <BarChart3 className="w-5 h-5 text-gray-500 shrink-0" />
          <span className="text-base sm:text-lg font-semibold">
            Contest Performance Analytics
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <Tabs defaultValue="subjects" className="w-full">
          <TabsList className="bg-gray-100 p-1 rounded-lg mb-6 h-auto w-full grid grid-cols-2 gap-1 sm:flex sm:w-auto sm:grid-cols-none">
            <TabsTrigger
              value="subjects"
              className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-600 font-medium"
            >
              Subject Analysis
            </TabsTrigger>
            <TabsTrigger
              value="grades"
              className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-600 font-medium"
            >
              Grade Analysis
            </TabsTrigger>
            <TabsTrigger
              value="missed"
              className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-600 font-medium"
            >
              Areas for Improvement
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-600 font-medium"
            >
              Performance Trends
            </TabsTrigger>
          </TabsList>

          {/* Subject Analysis Tab */}
          <TabsContent value="subjects" className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Performance by Subject
              </h3>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="subject"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="correctAnswers"
                      fill="#10b981"
                      name="Correct"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="missedQuestions"
                      fill="#ef4444"
                      name="Missed"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjectAnalysis.map((subject) => (
                <div
                  key={subject.subject}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-5"
                >
                  <h4 className="font-semibold text-gray-900 text-lg mb-2">
                    {subject.subject}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Accuracy:</span>
                      <span className="font-medium text-emerald-600">
                        {subject.accuracy}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Correct:</span>
                      <span className="font-medium text-gray-900">
                        {subject.correctAnswers}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total:</span>
                      <span className="font-medium text-gray-900">
                        {subject.totalQuestions}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Grade Analysis Tab */}
          <TabsContent value="grades" className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Performance by Grade Level
              </h3>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="grade"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="correctAnswers"
                      fill="#3b82f6"
                      name="Correct"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="missedQuestions"
                      fill="#f59e0b"
                      name="Missed"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* Areas for Improvement Tab */}
          <TabsContent value="missed" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <PieChartIcon className="w-5 h-5 text-emerald-600" />
                  <span>Missed Questions Distribution</span>
                </h3>
                <div className="h-64 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name} ${(percent! * 100).toFixed(0)}%`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          `${value} questions`,
                          "Missed",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <Target className="w-5 h-5 text-emerald-600" />
                  <span>Focus Areas</span>
                </h3>
                <div className="space-y-4">
                  {subjectAnalysis
                    .sort((a, b) => b.missedQuestions - a.missedQuestions)
                    .map((subject) => (
                      <div
                        key={subject.subject}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-gray-900">
                            {subject.subject}
                          </span>
                          <span className="text-sm text-red-600 font-medium">
                            {subject.missedQuestions} missed
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-400 h-2 rounded-full"
                            style={{
                              width: `${
                                (subject.missedQuestions /
                                  subject.totalQuestions) *
                                100
                              }%`,
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {Math.round(
                            (subject.missedQuestions / subject.totalQuestions) *
                              100
                          )}
                          % error rate
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Performance Trends Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span>Performance Over Time</span>
              </h3>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Accuracy"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ fill: "#10b981", r: 5 }}
                      name="Accuracy"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
