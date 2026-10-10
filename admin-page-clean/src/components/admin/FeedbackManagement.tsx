// src/components/admin/FeedbackManagement.tsx

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { describeApiError } from '@/services/feedbackServices';
import { Plus, Edit, Trash2, BarChart3, Star, Users, MessageSquare } from 'lucide-react';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// Updated interfaces
interface FeedbackQuestion {
  id: string;
  question: string;
  options: string[];
  isActive: boolean;
  createdAt: string;
}

interface PollOption {
  id: string;
  label: string;
  minScore?: number;
  maxScore?: number;
  requiresContact: boolean;
}

interface QuestionResponse {
  question_id: string;
  selected_option: string;
}

interface FeedbackResponse {
  id: string;
  studentId: string;
  studentName: string;
  questionResponses: { [questionId: string]: QuestionResponse };
  comment: string;
  pollResponse: string;
  contactInfo?: {
    score: number;
    phoneNumber: string;
    language: string;
  };
  submittedAt: string;
}

// Raw payload shapes as returned by the backend (domain JSON tags).
interface RawFeedbackQuestion {
  id: string;
  question: string;
  options?: string[];
  is_active: boolean;
  created_at: string;
}

interface RawPollOption {
  id: string;
  label: string;
  min_score?: number;
  max_score?: number;
  requires_contact: boolean;
}

interface RawFeedbackResponse {
  id: string;
  student_id: string;
  student_name: string;
  question_responses?: { [questionId: string]: QuestionResponse };
  comment?: string;
  poll_response: string;
  contact_info?: {
    score: number;
    phone_number: string;
    language: string;
  };
  submitted_at: string;
}

// Define types for items that can be deleted
type DeletableItemType = 'question' | 'pollOption' | 'response';

export default function FeedbackManagement() {
  const [activeTab, setActiveTab] = useState('questions');
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [responses, setResponses] = useState<FeedbackResponse[]>([]);
  const [filteredResponses, setFilteredResponses] = useState<FeedbackResponse[]>([]);
  const [selectedScoreRangeFilter, setSelectedScoreRangeFilter] = useState<string>('all');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FeedbackQuestion | null>(null);
  const [pollDialog, setPollDialog] = useState(false);
  const [editingPoll, setEditingPoll] = useState<PollOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Real logged-in admin id (domain.Admin.ID from GET /api/admin/me),
  // fetched once and cached; feedback questions are keyed by this on the backend.
  const adminIdRef = useRef<string | null>(null);

  // State for Confirmation Dialog
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
  const [itemToDeleteType, setItemToDeleteType] = useState<DeletableItemType | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  // Form states
  const [newQuestion, setNewQuestion] = useState({
    question: '',
    options: ['', '', '', ''],
  });

  const [newPollOption, setNewPollOption] = useState({
    label: '',
    minScore: 0,
    maxScore: 0,
    requiresContact: false
  });

  // All requests go through the shared `api` axios instance: relative paths
  // against VITE_API_URL with the admin token cookie attached.

  useEffect(() => {
    fetchAllData();
  }, []);

  const ensureAdminId = async (): Promise<string | null> => {
    if (adminIdRef.current) return adminIdRef.current;
    try {
      const response = await api.get('/api/admin/me');
      const id: string | undefined = response.data?.id;
      if (!id) {
        setError('Could not determine the logged-in admin: /api/admin/me returned no id.');
        return null;
      }
      adminIdRef.current = id;
      return id;
    } catch (err) {
      setError(describeApiError(err, 'Loading admin profile'));
      return null;
    }
  };

  useEffect(() => {
    if (selectedScoreRangeFilter === 'all') {
      setFilteredResponses(responses);
    } else {
      setFilteredResponses(responses.filter(r => r.pollResponse === selectedScoreRangeFilter));
    }
  }, [responses, selectedScoreRangeFilter]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchQuestions(),
        fetchPollOptions(),
        fetchResponses()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    try {
      const response = await api.get('/api/feedback-question/');
      const fetchedQuestions: FeedbackQuestion[] = response.data.questions.map((q: RawFeedbackQuestion) => ({
        id: q.id,
        question: q.question,
        options: q.options || [],
        isActive: q.is_active,
        createdAt: q.created_at
      }));
      setQuestions(fetchedQuestions);
    } catch (error) {
      console.error('Error fetching questions:', error);
      setError(describeApiError(error, 'Loading feedback questions'));
      setQuestions([]);
    }
  };

  const fetchPollOptions = async () => {
    try {
      const response = await api.get('/api/poll-option/');
      const fetchedPollOptions: PollOption[] = response.data.options.map((po: RawPollOption) => ({
        id: po.id,
        label: po.label,
        minScore: po.min_score,
        maxScore: po.max_score,
        requiresContact: po.requires_contact
      }));
      console.log('Fetched poll options:', fetchedPollOptions);
      setPollOptions(fetchedPollOptions);
    } catch (error) {
      console.error('Error fetching poll options:', error);
      setError(describeApiError(error, 'Loading poll options'));
      const fallbackOptions = [
        { id: 'p1', label: 'Less than 300', minScore: 0, maxScore: 299, requiresContact: false },
        { id: 'p2', label: 'Less than 400', minScore: 300, maxScore: 399, requiresContact: false },
        { id: 'p3', label: 'Less than 500', minScore: 400, maxScore: 499, requiresContact: false },
        { id: 'p4', label: 'Between 500-600', minScore: 500, maxScore: 600, requiresContact: true }
      ];
      console.log('Using fallback poll options:', fallbackOptions);
      setPollOptions(fallbackOptions);
    }
  };

  const fetchResponses = async () => {
    try {
      const response = await api.get('/api/feedback-response/');
      const fetchedResponses: FeedbackResponse[] = response.data.responses.map((r: RawFeedbackResponse) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        questionResponses: r.question_responses || {},
        comment: r.comment || '',
        pollResponse: r.poll_response,
        contactInfo: r.contact_info ? {
          score: r.contact_info.score,
          phoneNumber: r.contact_info.phone_number,
          language: r.contact_info.language
        } : undefined,
        submittedAt: r.submitted_at
      }));
      console.log('Fetched responses with poll responses:', fetchedResponses.map(r => ({ 
        studentName: r.studentName, 
        pollResponse: r.pollResponse 
      })));
      setResponses(fetchedResponses);
    } catch (error) {
      console.error('Error fetching responses:', error);
      setError(describeApiError(error, 'Loading responses'));
      setResponses([]);
    }
  };

  const handleSaveQuestion = async () => {
    const adminId = await ensureAdminId();
    if (!adminId) return;
    try {
      const questionData = {
        question: newQuestion.question,
        options: newQuestion.options.filter(opt => opt.trim() !== ''),
        admin_id: adminId,
        is_active: true
      };

      if (editingQuestion) {
        await api.put(`/api/feedback-question/${editingQuestion.id}`, questionData);
      } else {
        await api.post('/api/feedback-question/', questionData);
      }

      setOpenDialog(false);
      setEditingQuestion(null);
      setNewQuestion({
        question: '',
        options: ['', '', '', '']
      });
      fetchQuestions();
    } catch (error) {
      console.error('Error saving question:', error);
      setError(describeApiError(error, 'Saving question'));
    }
  };

  const confirmDelete = (id: string, type: DeletableItemType) => {
    setItemToDeleteId(id);
    setItemToDeleteType(type);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDeleteId || !itemToDeleteType) return;

    try {
      switch (itemToDeleteType) {
        case 'question':
          await api.delete(`/api/feedback-question/${itemToDeleteId}`);
          fetchQuestions();
          break;
        case 'pollOption':
          await api.delete(`/api/poll-option/${itemToDeleteId}`);
          fetchPollOptions();
          break;
        case 'response':
          await api.delete(`/api/feedback-response/${itemToDeleteId}`);
          fetchResponses();
          break;
        default:
          console.warn('Unknown item type for deletion:', itemToDeleteType);
      }
    } catch (error) {
      console.error(`Error deleting ${itemToDeleteType}:`, error);
      setError(describeApiError(error, `Deleting ${itemToDeleteType} failed`));
    } finally {
      setItemToDeleteId(null);
      setItemToDeleteType(null);
    }
  };

  const handleDeleteAllResponses = async () => {
    try {
      const deletePromises = responses.map(response => 
        api.delete(`/api/feedback-response/${response.id}`)
      );
      
      await Promise.all(deletePromises);
      console.log(`Successfully deleted ${responses.length} responses`);
      
      // Refresh the responses list
      fetchResponses();
      setShowDeleteAllDialog(false);
    } catch (error) {
      console.error('Error deleting all responses:', error);
      setError(describeApiError(error, 'Deleting all responses'));
    }
  };

  const toggleQuestionStatus = async (id: string, isActive: boolean) => {
    const adminId = await ensureAdminId();
    if (!adminId) return;
    try {
      const currentQuestion = questions.find(q => q.id === id);
      if (!currentQuestion) return;

      const updateData = {
        question: currentQuestion.question,
        options: currentQuestion.options,
        admin_id: adminId,
        is_active: isActive
      };

      await api.put(`/api/feedback-question/${id}`, updateData);
      fetchQuestions();
    } catch (error) {
      console.error('Error toggling question status:', error);
      setError(describeApiError(error, 'Updating question status'));
    }
  };

  const handleSavePollOption = async () => {
    try {
      const pollOptionData = {
        label: newPollOption.label,
        min_score: newPollOption.minScore,
        max_score: newPollOption.maxScore,
        requires_contact: newPollOption.requiresContact,
      };

      if (editingPoll) {
        await api.put(`/api/poll-option/${editingPoll.id}`, pollOptionData);
      } else {
        await api.post('/api/poll-option/', pollOptionData);
      }
      setPollDialog(false);
      setEditingPoll(null);
      setNewPollOption({
        label: '',
        minScore: 0,
        maxScore: 0,
        requiresContact: false
      });
      fetchPollOptions();
    } catch (error) {
      console.error('Error saving poll option:', error);
      setError(describeApiError(error, 'Saving poll option'));
    }
  };

  const getQuestionText = (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    return question ? question.question : `Question ${questionId}`;
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Feedback Management</h1>
        <p className="text-muted-foreground">
          Manage student feedback questions, polls, and responses with ease
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-2 h-2 bg-red-fix-500 rounded-full shrink-0"></div>
            <p className="text-sm font-medium text-red-800 min-w-0 flex-1 break-words">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800 hover:bg-red-100"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="bg-gradient-to-r from-blue-fix-500 to-blue-fix-600 text-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Total Questions</CardTitle>
              <MessageSquare className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{questions.length}</div>
            <p className="text-blue-fix-100 text-sm">Active feedback questions</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-fix-500 to-green-fix-600 text-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Poll Options</CardTitle>
              <BarChart3 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pollOptions.length}</div>
            <p className="text-green-fix-100 text-sm">Score range options</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-fix-500 to-purple-fix-600 text-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Responses</CardTitle>
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{responses.length}</div>
            <p className="text-purple-fix-100 text-sm">Student feedback received</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Questions
          </TabsTrigger>
          <TabsTrigger value="polls" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Poll Options
          </TabsTrigger>
          <TabsTrigger value="responses" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Responses
          </TabsTrigger>
        </TabsList>

        {/* Questions Tab */}
        <TabsContent value="questions" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold">Feedback Questions</h2>
              <p className="text-muted-foreground">Create and manage feedback questions for students</p>
            </div>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingQuestion(null);
                  setNewQuestion({
                    question: '',
                    options: ['', '', '', '']
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingQuestion ? 'Edit Question' : 'Add New Question'}
                  </DialogTitle>
                  <DialogDescription>
                    Create a new feedback question with multiple choice options
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="question">Question</Label>
                    <Textarea
                      id="question"
                      placeholder="Enter your feedback question..."
                      value={newQuestion.question}
                      onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label>Options</Label>
                    {newQuestion.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder={`Option ${index + 1}`}
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...newQuestion.options];
                            newOptions[index] = e.target.value;
                            setNewQuestion({ ...newQuestion, options: newOptions });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveQuestion}>
                    {editingQuestion ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {questions.map((question) => (
              <Card key={question.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base sm:text-lg leading-tight min-w-0 break-words">{question.question}</CardTitle>
                    <Badge variant={question.isActive ? "default" : "secondary"} className="shrink-0">
                      {question.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription>
                    Created {(() => {
                      try {
                        if (!question.createdAt) return 'Unknown date';
                        const date = new Date(question.createdAt);
                        if (isNaN(date.getTime())) return 'Invalid date';
                        return date.toLocaleDateString();
                      } catch (error) {
                        console.warn('Error formatting createdAt date:', error);
                        return 'Unknown date';
                      }
                    })()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Options:</Label>
                    <div className="mt-2 space-y-1">
                      {question.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                          <div className="w-2 h-2 bg-primary rounded-full shrink-0"></div>
                          <span className="min-w-0 break-words">{option}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={question.isActive}
                        onChange={(e) => toggleQuestionStatus(question.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label className="text-sm">Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingQuestion(question);
                          setNewQuestion({
                            question: question.question,
                            options: [...question.options],
                          });
                          setOpenDialog(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit question</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmDelete(question.id, 'question')}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete question</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Question</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this question? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Poll Options Tab */}
        <TabsContent value="polls" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold">Poll Options</h2>
              <p className="text-muted-foreground">Configure score ranges and contact requirements</p>
            </div>
            <Dialog open={pollDialog} onOpenChange={setPollDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingPoll(null);
                  setNewPollOption({
                    label: '',
                    minScore: 0,
                    maxScore: 0,
                    requiresContact: false
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Poll Option
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100vw-2rem)]">
                <DialogHeader>
                  <DialogTitle>
                    {editingPoll ? 'Edit Poll Option' : 'Add Poll Option'}
                  </DialogTitle>
                  <DialogDescription>
                    Create a new poll option with score range and contact requirements
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="label">Label</Label>
                    <Input
                      id="label"
                      placeholder="e.g., Less than 300"
                      value={newPollOption.label}
                      onChange={(e) => setNewPollOption({ ...newPollOption, label: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minScore">Min Score</Label>
                      <Input
                        id="minScore"
                        type="number"
                        value={newPollOption.minScore}
                        onChange={(e) => setNewPollOption({ ...newPollOption, minScore: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxScore">Max Score</Label>
                      <Input
                        id="maxScore"
                        type="number"
                        value={newPollOption.maxScore}
                        onChange={(e) => setNewPollOption({ ...newPollOption, maxScore: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newPollOption.requiresContact}
                      onChange={(e) => setNewPollOption({ ...newPollOption, requiresContact: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label>Requires Contact Information</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPollDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSavePollOption}>
                    {editingPoll ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {pollOptions.map((option) => (
              <Card key={option.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{option.label}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>Score Range:</span>
                    <Badge variant="outline" className="font-mono">
                      {option.minScore} - {option.maxScore}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {option.requiresContact && (
                    <Badge variant="secondary" className="w-fit">
                      Requires Contact Info
                    </Badge>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingPoll(option);
                        setNewPollOption({
                          label: option.label,
                          minScore: option.minScore || 0,
                          maxScore: option.maxScore || 0,
                          requiresContact: option.requiresContact
                        });
                        setPollDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmDelete(option.id, 'pollOption')}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Poll Option</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this poll option? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Responses Tab */}
        <TabsContent value="responses" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold">Student Responses</h2>
              <p className="text-muted-foreground">View and manage student feedback responses</p>
            </div>
             <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              onClick={() => navigate('../high-scorers')}
              className="w-full sm:w-auto bg-gradient-to-r from-purple-fix-600 to-pink-fix-600 hover:from-purple-fix-700 hover:to-pink-fix-700 text-white"
            >
              <Star className="h-4 w-4 mr-2" />
              High Scorers Contact List
            </Button>
               {responses.length > 0 && (
                 <Button
                   variant="destructive"
                   onClick={() => setShowDeleteAllDialog(true)}
                   className="w-full sm:w-auto bg-red-fix-600 hover:bg-red-fix-700 text-white"
                 >
                   <Trash2 className="h-4 w-4 mr-2" />
                   Delete All Responses
                 </Button>
               )}
             </div>
           </div>

          {/* Filter by Score Range */}
          <div className="mb-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">Filter Responses</h3>
                <p className="text-sm text-muted-foreground">
                  Total Responses: {responses.length}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 min-w-0">
                <Label htmlFor="score-range-filter" className="text-sm shrink-0">Filter by Score Range:</Label>
                <select 
                  id="score-range-filter" 
                  className="w-full sm:w-48 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-background"
                  value={selectedScoreRangeFilter} 
                  onChange={(e) => setSelectedScoreRangeFilter(e.target.value)}
                >
                  <option value="all">All Score Ranges</option>
                  {pollOptions.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.label} ({option.minScore}-{option.maxScore})
                    </option>
                  ))}
                </select>
                {selectedScoreRangeFilter !== 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScoreRangeFilter('all')}
                    className="text-xs"
                  >
                    Clear Filter
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {selectedScoreRangeFilter !== 'all' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-2 h-2 bg-blue-fix-500 rounded-full shrink-0"></div>
                  <p className="text-sm font-medium text-blue-800 min-w-0 break-words">
                    Filtered by: {selectedScoreRangeFilter}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedScoreRangeFilter('all')}
                    className="ml-auto text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  >
                    Clear Filter
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredResponses.length} of {responses.length} responses
                {selectedScoreRangeFilter !== 'all' && ` for "${selectedScoreRangeFilter}"`}
              </p>
            </div>
            {filteredResponses.length > 0 ? (
              filteredResponses.map((response) => (
                <Card key={response.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-lg min-w-0 break-words">{response.studentName}</CardTitle>
                        <CardDescription>
                          Submitted {(() => {
                            try {
                              if (!response.submittedAt) return 'Unknown date';
                              const date = new Date(response.submittedAt);
                              if (isNaN(date.getTime())) return 'Invalid date';
                              return date.toLocaleDateString();
                            } catch (error) {
                              console.warn('Error formatting submittedAt date:', error);
                              return 'Unknown date';
                            }
                          })()}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {response.contactInfo?.language === 'amharic' ? 'Amharic' : 'English'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Question Responses */}
                    {Object.keys(response.questionResponses).length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Question Responses:</Label>
                        {Object.entries(response.questionResponses).map(([questionId, questionResponse]) => (
                          <div key={questionId} className="pl-4 border-l-2 border-muted min-w-0">
                            <p className="text-sm font-medium text-foreground break-words">
                              {getQuestionText(questionId)}:
                            </p>
                            <p className="text-sm text-muted-foreground ml-2 break-words">
                              {questionResponse.selected_option}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Poll Response */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Score Range Selection:</Label>
                      <div className="space-y-2">
                        {response.pollResponse && response.pollResponse.trim() !== "" ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-sm">
                                {response.pollResponse}
                              </Badge>
                              {(() => {
                                // Try exact match first
                                let pollOption = pollOptions.find(opt => opt.label === response.pollResponse);
                                
                                // If exact match not found, try case-insensitive match
                                if (!pollOption) {
                                  pollOption = pollOptions.find(opt => 
                                    opt.label.toLowerCase() === response.pollResponse.toLowerCase()
                                  );
                                }
                                
                                // If still not found, try partial match
                                if (!pollOption) {
                                  pollOption = pollOptions.find(opt => 
                                    opt.label.toLowerCase().includes(response.pollResponse.toLowerCase()) ||
                                    response.pollResponse.toLowerCase().includes(opt.label.toLowerCase())
                                  );
                                }
                                
                                if (pollOption?.requiresContact) {
                                  return (
                                    <Badge variant="destructive" className="text-xs">
                                      Requires Contact
                                    </Badge>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {(() => {
                              // Find the corresponding poll option to get the actual score range
                              // Try exact match first
                              let pollOption = pollOptions.find(opt => opt.label === response.pollResponse);
                              
                              // If exact match not found, try case-insensitive match
                              if (!pollOption) {
                                pollOption = pollOptions.find(opt => 
                                  opt.label.toLowerCase() === response.pollResponse.toLowerCase()
                                );
                              }
                              
                              // If still not found, try partial match
                              if (!pollOption) {
                                pollOption = pollOptions.find(opt => 
                                  opt.label.toLowerCase().includes(response.pollResponse.toLowerCase()) ||
                                  response.pollResponse.toLowerCase().includes(opt.label.toLowerCase())
                                );
                              }
                              
                              console.log('Looking for poll option:', response.pollResponse, 'Available options:', pollOptions.map(opt => opt.label), 'Found:', pollOption);
                              
                              if (pollOption && pollOption.minScore !== undefined && pollOption.maxScore !== undefined) {
                                return (
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
                                    <span>Score Range:</span>
                                    <code className="bg-muted px-2 py-1 rounded font-mono">
                                      {pollOption.minScore} - {pollOption.maxScore}
                                    </code>
                                  </div>
                                );
                              } else {
                                // If poll option not found, show a fallback message
                                return (
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
                                    <span>Score Range:</span>
                                    <code className="bg-muted px-2 py-1 rounded font-mono">
                                      Not available
                                    </code>
                                    <span className="text-orange-600">(Poll option not found for: "{response.pollResponse}")</span>
                                  </div>
                                );
                              }
                            })()}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-sm bg-gray-100 text-gray-600">
                              No Score Range Selected
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Student did not provide a score range
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    {response.contactInfo && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Contact Information:</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                          <div className="min-w-0 break-words">
                            <span className="font-medium">Score:</span> {response.contactInfo.score}
                          </div>
                          <div className="min-w-0 break-words">
                            <span className="font-medium">Phone:</span> {response.contactInfo.phoneNumber}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Comment */}
                    {response.comment && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Additional Comment:</Label>
                        <p className="text-sm text-muted-foreground italic break-words">"{response.comment}"</p>
                      </div>
                    )}

                    <Separator />

                    <div className="flex justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmDelete(response.id, 'response')}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Response
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Response</AlertDialogTitle>
                            <AlertDialogDescription>
                          Are you sure you want to delete this response? This will permanently remove the entire response including contact information. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center space-y-2">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
                    {selectedScoreRangeFilter === 'all' ? (
                      <>
                    <h3 className="text-lg font-medium">No responses yet</h3>
                    <p className="text-muted-foreground">
                      Student feedback responses will appear here once they start submitting.
                    </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-medium">No responses for selected score range</h3>
                        <p className="text-muted-foreground">
                          No students have selected "{selectedScoreRangeFilter}" as their score range.
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

       {/* Delete All Responses Confirmation Dialog */}
       <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
         <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
           <AlertDialogHeader>
             <AlertDialogTitle>Delete All Responses</AlertDialogTitle>
                           <AlertDialogDescription>
                Are you sure you want to delete all {responses.length} student feedback responses? 
                This will permanently remove all responses including contact information. 
                This action cannot be undone.
              </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction 
               onClick={handleDeleteAllResponses} 
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               Delete All Responses
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
    </div>
  );
}
