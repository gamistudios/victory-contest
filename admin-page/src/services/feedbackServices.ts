import api from './api';

export interface AnalyticsData {
  total_responses: number;
  question_stats: QuestionStat[];
  poll_stats: PollStat[];
  contact_list: ContactListItem[];
  comment_summary: CommentSummary;
}

export interface QuestionStat {
  question_id: string;
  question: string;
  responses: { [key: string]: number };
}

export interface PollStat {
  option_id: string;
  option: string;
  count: number;
  percentage: number;
}

export interface ContactListItem {
  name: string;
  score: number;
  phone_number: string;
  submitted_at: string;
}

export interface CommentSummary {
  total_comments: number;
  average_length: number;
}

export const feedbackServices = {
  // Test endpoint
  testConnection: async (): Promise<any> => {
    const response = await api.get('/api/feedback-response/test');
    return response.data;
  },

  // Get feedback analytics
  getAnalytics: async (timeRange: string = 'all', adminId?: string): Promise<AnalyticsData> => {
    const params = new URLSearchParams();
    if (timeRange !== 'all') {
      params.append('range', timeRange);
    }
    if (adminId) {
      params.append('admin_id', adminId);
    }

    const response = await api.get(`/api/feedback-response/analytics?${params.toString()}`);
    return response.data;
  },

  // Delete contact by phone number
  deleteContact: async (phoneNumber: string): Promise<void> => {
    // URL encode the phone number to handle special characters
    const encodedPhoneNumber = encodeURIComponent(phoneNumber);
    const url = `/api/feedback-response/contact/${encodedPhoneNumber}`;
    console.log('Deleting contact with URL:', url);
    try {
      await api.delete(url);
    } catch (error: any) {
      console.error('Delete contact error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url
      });
      throw error;
    }
  },

  // Get all feedback responses
  getAllResponses: async () => {
    const response = await api.get('/api/feedback-response/');
    return response.data.responses;
  },

  // Get feedback responses by student
  getResponsesByStudent: async (studentId: string) => {
    const response = await api.get(`/api/feedback-response/student/${studentId}`);
    return response.data.responses;
  },

  // Get feedback responses by question
  getResponsesByQuestion: async (questionId: string) => {
    const response = await api.get(`/api/feedback-response/question/${questionId}`);
    return response.data.responses;
  },

  // Get all feedback questions
  getAllQuestions: async () => {
    const response = await api.get('/api/feedback-question/');
    return response.data.questions;
  },

  // Get active feedback questions
  getActiveQuestions: async () => {
    const response = await api.get('/api/feedback-question/active');
    return response.data.questions;
  },

  // Get all poll options
  getAllPollOptions: async () => {
    const response = await api.get('/api/poll-option/');
    return response.data.options;
  }
}; 