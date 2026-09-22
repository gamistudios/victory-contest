export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    chat_type?: string;
    chat_instance?: string;
    start_param?: string;
    auth_date?: number;
    hash?: string;
    query_id?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setParams: (params: any) => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (
      style: "light" | "medium" | "heavy" | "rigid" | "soft"
    ) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  ready: () => void;
  close: () => void;
  expand: () => void;
  sendData: (data: string) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  showPopup: (
    params: {
      title?: string;
      message: string;
      buttons?: Array<{ id: string; type?: string; text: string }>;
    },
    callback?: (buttonId: string) => void
  ) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (
    message: string,
    callback?: (confirmed: boolean) => void
  ) => void;
  requestWriteAccess: (callback?: (granted: boolean) => void) => void;
  requestContact: (callback?: (shared: boolean) => void) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  switchInlineQuery: (query: string, chatTypes?: string[]) => void;
  readTextFromClipboard: () => string | null;
  shareMessage: (
    msg_id: string,
    callback: (success: boolean) => void
  ) => Promise<void>;
  downloadFile?: (fileUrl: string, fileName?: string) => void;
  CloudStorage: {
    setItem: (
      key: string,
      value: string,
      callback?: (error: string | null, result?: boolean) => void
    ) => void;
    getItem: (
      key: string,
      callback: (error: string | null, result?: string) => void
    ) => void;
    getItems: (
      keys: string[],
      callback: (error: string | null, result?: Record<string, string>) => void
    ) => void;
    removeItem: (
      key: string,
      callback?: (error: string | null, result?: boolean) => void
    ) => void;
    removeItems: (
      keys: string[],
      callback?: (error: string | null, result?: boolean) => void
    ) => void;
    getKeys: (
      callback: (error: string | null, result?: string[]) => void
    ) => void;
  };
}
export interface InlineQueryResultArticle {
  type: "article"; // always "article"
  id: string; // unique identifier for this result
  title: string;
  input_message_content: InputMessageContent;
  url?: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  reply_markup?: any;
}
export interface LinkPreviewOption {
  is_disabled: boolean; // Optional. True, if the link preview is disabled
  url: string; // Optional. URL to use for the link preview. If empty, then the first URL found in the message text will be used
  prefer_small_media: boolean; // Optional. True, if the media in the link preview is supposed to be shrunk; ignored if the URL isn't explicitly specified or media size change isn't supported for the preview
  prefer_large_media: boolean; // Optional. True, if the media in the link preview is supposed to be enlarged; ignored if the URL isn't explicitly specified or media size change isn't supported for the preview
  show_above_text?: boolean;
}
export interface InputMessageContent {
  message_text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  link_preview_options?: LinkPreviewOption;
}

export interface Question {
  id: string;
  question_text: string;
  answer: string;
  explanation: string;
  subject: string;
  grade: string;
  chapter: string;
  multiple_choice: string[];
  difficulty?: "easy" | "medium" | "hard";
  question_img?: string;
}

export interface ContestAnswer {
  question: Question;
  selected_answer: number;
  is_correct: boolean;
  time_taken: number;
}
export interface Student {
  id: string; // or use telegram_id as pk if unique
  telegram_id: string; // link this to submissions or registrations
  name: string;
  age: string; // originally string, but better as date for calculation
  city: string;
  region: string;
  school: string;
  grade: string;
  imgurl?: string;
  isSuspended?: boolean;
  defaultScoreRange?: string; // Stores the student's permanent score range selection
  badge?: string[];
  is_premium?: boolean;
  phoneNumber?: string;
  read_notifications?: { [key: string]: { id: string; is_deleted: boolean } };
}
export interface AuthStudent extends Student {
  is_premium: boolean;
  read_notifications: { [key: string]: { id: string; is_deleted: boolean } };
}

export interface Achievement {
  name: string;
  description: string;
  type: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  earned: boolean;
  earnedDate: string;
  progress: string;
}
export interface UserStat {}
export interface Contest {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  subject: string;
  grade: string;
  prize: string;
  active_contestant: Student[];
  questions: Question[];
  type: "free" | "premium";
  status: string;
  performance_trend?: Array<{
    month: string;
    accuracy: number;
    questions: number;
  }>;
}

export interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_taken: string;
  rank: number;
  imgurl?: string;
}

export interface UserStats {
  total_contests: number;
  total_questions: number;
  correct_answers: number;
  accuracy: number;
  average_time: number;
  subjects: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  chapters: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  grades: {
    [key: string]: {
      total: number;
      correct: number;
      accuracy: number;
    };
  };
  performance_trend?: Array<{
    month: string;
    accuracy: number;
    questions: number;
  }>;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export type PaymentStatus = "Approved" | "Pending" | "Rejected" | "Expired";

// This now matches the interface you provided
export interface PaymentRequest {
  id: string;
  userId: string;
  fullName: string;
  bankName: string;
  billScreenshotUrl: string;
  status: PaymentStatus;
  rejectionReason?: string;
  createdAt: string; // ISO String
  updatedAt: string;
  expirationDate?: string;
  medium?: string;
}
export interface Achievement {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  earned: boolean;
  earnedDate: string;
}

export interface ContestInfo {
  id: string;
  title: string;
  duration: string;
  questions: number;
  participants: number;
  startTime: string;
  prizes: string | null;
}
