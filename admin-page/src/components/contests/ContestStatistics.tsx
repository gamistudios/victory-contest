import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Filter,
  Download,
  Target
} from "lucide-react";

// shadcn components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// Services
import { 
  getContestStatistics, 
  getStudentPerformances, 
  exportContestStatistics,
  StatisticsFilters
} from "@/services/contestStatisticsService";

// Types for statistics
interface CityStats {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  average_score: number;
}

interface SchoolStats {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  average_score: number;
}

interface GradeStats {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  average_score: number;
}

interface ContestStatisticsData {
  total_participants: number;
  passed_count: number;
  failed_count: number;
  pass_rate: number;
  average_score: number;
  gender_stats: {
    male: { total: number; passed: number; failed: number; pass_rate: number; average_score: number };
    female: { total: number; passed: number; failed: number; pass_rate: number; average_score: number };
  };
  city_stats: Record<string, CityStats>;
  school_stats: Record<string, SchoolStats>;
  grade_stats: Record<string, GradeStats>;
  score_distribution: { excellent: number; good: number; average: number; poor: number };
  performance_levels: { excellent: number; good: number; average: number; fail: number };
}

interface ContestStatisticsProps {
  contestId: string;
}

export default function ContestStatistics({ contestId }: ContestStatisticsProps) {
  const [genderFilter, setGenderFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [cities, setCities] = useState<string[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);

  // Create filters object
  const filters: StatisticsFilters = {
    gender: genderFilter !== "all" ? genderFilter : undefined,
    city: cityFilter !== "all" ? cityFilter : undefined,
    school: schoolFilter !== "all" ? schoolFilter : undefined,
    grade: gradeFilter !== "all" ? gradeFilter : undefined,
  };

  // Fetch contest statistics from backend
  const { data: stats, status: statsStatus, refetch: refetchStats } = useQuery({
    queryKey: ["contest_statistics", contestId, filters],
    queryFn: async () => getContestStatistics(contestId, filters),
    enabled: !!contestId,
  });

  // Fetch student performances for filter options
  const { data: studentPerformances } = useQuery({
    queryKey: ["student_performances", contestId],
    queryFn: async () => getStudentPerformances(contestId, 1, 1000, {}),
    enabled: !!contestId,
  });

  // Process filter options when student performances are loaded
  useEffect(() => {
    if (studentPerformances?.students) {
      const uniqueCities = new Set<string>();
      const uniqueSchools = new Set<string>();
      const uniqueGrades = new Set<string>();

      studentPerformances.students.forEach(student => {
        if (student.student_city) uniqueCities.add(student.student_city);
        if (student.student_school) uniqueSchools.add(student.student_school);
        if (student.student_grade) uniqueGrades.add(student.student_grade);
      });

      setCities(Array.from(uniqueCities).sort());
      setSchools(Array.from(uniqueSchools).sort());
      setGrades(Array.from(uniqueGrades).sort());
    }
  }, [studentPerformances]);

  // Refetch statistics when filters change
  useEffect(() => {
    refetchStats();
  }, [genderFilter, cityFilter, schoolFilter, gradeFilter, refetchStats]);

  // Default empty statistics
  const defaultStats: ContestStatisticsData = {
    total_participants: 0,
    passed_count: 0,
    failed_count: 0,
    pass_rate: 0,
    average_score: 0,
    gender_stats: {
      male: { total: 0, passed: 0, failed: 0, pass_rate: 0, average_score: 0 },
      female: { total: 0, passed: 0, failed: 0, pass_rate: 0, average_score: 0 }
    },
    city_stats: {},
    school_stats: {},
    grade_stats: {},
    score_distribution: { excellent: 0, good: 0, average: 0, poor: 0 },
    performance_levels: { excellent: 0, good: 0, average: 0, fail: 0 }
  };

  const statistics: ContestStatisticsData = (stats as ContestStatisticsData) || defaultStats;

  if (statsStatus === "pending") {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (statsStatus === "error") {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Error loading statistics data</p>
      </div>
    );
  }

  const exportData = () => {
    exportContestStatistics(contestId, filters);
    toast.success("Statistics exported successfully");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contest Statistics</h2>
          <p className="text-gray-600">Detailed analytics and performance metrics</p>
        </div>
        <Button onClick={exportData} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>Filter statistics by different criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Gender</label>
              <Select onValueChange={setGenderFilter} value={genderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">City</label>
              <Select onValueChange={setCityFilter} value={cityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">School</label>
              <Select onValueChange={setSchoolFilter} value={schoolFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Schools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school} value={school}>{school}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Grade</label>
              <Select onValueChange={setGradeFilter} value={gradeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade} value={grade}>Grade {grade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Active Filters Summary */}
          {(genderFilter !== "all" || cityFilter !== "all" || schoolFilter !== "all" || gradeFilter !== "all") && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">Active Filters:</p>
              <div className="flex flex-wrap gap-2">
                {genderFilter !== "all" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Gender: {genderFilter}
                  </Badge>
                )}
                {cityFilter !== "all" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    City: {cityFilter}
                  </Badge>
                )}
                {schoolFilter !== "all" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    School: {schoolFilter}
                  </Badge>
                )}
                {gradeFilter !== "all" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Grade: {gradeFilter}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{statistics.total_participants}</div>
            <p className="text-xs text-muted-foreground">
              Students who participated
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statistics.pass_rate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics.passed_count} passed, {statistics.failed_count} failed
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {statistics.average_score.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              Out of total questions
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Target className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {statistics.total_participants > 0 ? ((statistics.passed_count / statistics.total_participants) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Students who passed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gender">Gender Analysis</TabsTrigger>
          <TabsTrigger value="geographic">Geographic</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Pass/Fail Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Pass/Fail Distribution</CardTitle>
              <CardDescription>Overall performance breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Passed</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{statistics.passed_count} students</span>
                    <Badge variant="secondary">{statistics.pass_rate.toFixed(1)}%</Badge>
                  </div>
                </div>
                <Progress value={statistics.pass_rate} className="h-2" />
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="font-medium">Failed</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{statistics.failed_count} students</span>
                    <Badge variant="secondary">{(100 - statistics.pass_rate).toFixed(1)}%</Badge>
                  </div>
                </div>
                <Progress value={100 - statistics.pass_rate} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Score Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
              <CardDescription>Performance levels breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { label: "Excellent (90-100%)", count: statistics.score_distribution.excellent, color: "bg-green-500" },
                  { label: "Good (70-89%)", count: statistics.score_distribution.good, color: "bg-blue-500" },
                  { label: "Average (50-69%)", count: statistics.score_distribution.average, color: "bg-yellow-500" },
                  { label: "Poor (0-49%)", count: statistics.score_distribution.poor, color: "bg-red-500" }
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.label}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600">{item.count} students</span>
                      <div className={`w-4 h-4 rounded ${item.color}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gender" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gender-based Performance</CardTitle>
              <CardDescription>Performance analysis by gender</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  { gender: "Male", stats: statistics.gender_stats.male, color: "text-blue-600" },
                  { gender: "Female", stats: statistics.gender_stats.female, color: "text-pink-600" }
                ].map((item, index) => (
                  <div key={index} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className={`font-semibold ${item.color}`}>{item.gender}</h4>
                      <Badge variant="outline">{item.stats.total} participants</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-lg font-bold text-green-600">{item.stats.passed}</div>
                        <div className="text-xs text-gray-600">Passed</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-lg font-bold text-red-600">{item.stats.failed}</div>
                        <div className="text-xs text-gray-600">Failed</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Pass Rate:</span>
                      <Badge variant="secondary">{item.stats.pass_rate.toFixed(1)}%</Badge>
                    </div>
                    <Progress value={item.stats.pass_rate} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geographic" className="space-y-6">
          {/* City Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance by City</CardTitle>
              <CardDescription>Pass rates across different cities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statistics.city_stats)
                  .sort(([,a], [,b]) => (b as any).pass_rate - (a as any).pass_rate)
                  .map(([city, cityStats]) => (
                    <div key={city} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{city}</span>
                        <Badge variant="outline">{cityStats.total} students</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Progress value={(cityStats as any).pass_rate} className="h-2" />
                        </div>
                        <Badge variant="secondary">{(cityStats as any).pass_rate.toFixed(1)}%</Badge>
                      </div>
                      <div className="text-xs text-gray-600">
                        {(cityStats as any).passed} passed, {(cityStats as any).failed} failed
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* School Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance by School</CardTitle>
              <CardDescription>Pass rates across different schools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statistics.school_stats)
                  .sort(([,a], [,b]) => (b as any).pass_rate - (a as any).pass_rate)
                  .map(([school, schoolStats]) => (
                    <div key={school} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{school}</span>
                        <Badge variant="outline">{schoolStats.total} students</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Progress value={(schoolStats as any).pass_rate} className="h-2" />
                        </div>
                        <Badge variant="secondary">{(schoolStats as any).pass_rate.toFixed(1)}%</Badge>
                      </div>
                      <div className="text-xs text-gray-600">
                        {(schoolStats as any).passed} passed, {(schoolStats as any).failed} failed
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Grade Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance by Grade</CardTitle>
              <CardDescription>Pass rates across different grades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statistics.grade_stats)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([grade, gradeStats]) => (
                    <div key={grade} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Grade {grade}</span>
                        <Badge variant="outline">{gradeStats.total} students</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Progress value={(gradeStats as any).pass_rate} className="h-2" />
                        </div>
                        <Badge variant="secondary">{(gradeStats as any).pass_rate.toFixed(1)}%</Badge>
                      </div>
                      <div className="text-xs text-gray-600">
                        {(gradeStats as any).passed} passed, {(gradeStats as any).failed} failed
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Detailed Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Performance Breakdown</CardTitle>
              <CardDescription>Comprehensive statistics table</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Passed</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Pass Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Overall</TableCell>
                    <TableCell>{statistics.total_participants}</TableCell>
                    <TableCell className="text-green-600">{statistics.passed_count}</TableCell>
                    <TableCell className="text-red-600">{statistics.failed_count}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statistics.pass_rate.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Male</TableCell>
                    <TableCell>{statistics.gender_stats.male.total}</TableCell>
                    <TableCell className="text-green-600">{statistics.gender_stats.male.passed}</TableCell>
                    <TableCell className="text-red-600">{statistics.gender_stats.male.failed}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statistics.gender_stats.male.pass_rate.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Female</TableCell>
                    <TableCell>{statistics.gender_stats.female.total}</TableCell>
                    <TableCell className="text-green-600">{statistics.gender_stats.female.passed}</TableCell>
                    <TableCell className="text-red-600">{statistics.gender_stats.female.failed}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statistics.gender_stats.female.pass_rate.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
