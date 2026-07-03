export interface Affirmation {
  id: string;
  text: string;
  pillar: "career" | "identity" | "assets" | "general";
  is_active: boolean;
  created_at: string;
}

export interface DailyHabit {
  id: string;
  name: string;
  name_en: string;
  category: "career" | "identity" | "assets" | "health";
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  value: string | null;
  created_at: string;
}

export interface HabitWithLog extends DailyHabit {
  log: HabitLog | null;
}

export interface Conversation {
  id: string;
  date: string;
  partner: string;
  context: string;
  summary: string;
  went_well: string;
  to_improve: string;
  is_imported: boolean;
  source_text: string | null;
  created_at: string;
}

export interface ConversationTopic {
  id: string;
  topic: string;
  content: string | null;
  category: string | null;
  used_count: number;
  source_conversation_id: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  title: string;
  pillar: "career" | "identity" | "assets";
  timeframe: "6month" | "1year" | "3year" | "5year" | "10year";
  status: "not_started" | "in_progress" | "completed" | "abandoned";
  target_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NumericTarget {
  id: string;
  name: string;
  unit: string;
  target_value: number;
  pillar: "career" | "identity" | "assets";
  created_at: string;
}

export interface NumericLog {
  id: string;
  target_id: string;
  date: string;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface DailyTodo {
  id: string;
  date: string;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface DailyJournal {
  id: string;
  date: string;
  accomplishments: string;
  to_improve: string;
  went_well: string;
  created_at: string;
  updated_at: string;
}

export interface DailyDiary {
  id: string;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MonthlyGoal {
  id: string;
  month: string; // 'YYYY-MM'
  text: string;
  pillar: "career" | "identity" | "assets";
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WeeklyGoal {
  id: string;
  week: string; // 'YYYY-Www' (예: '2026-W10')
  text: string;
  pillar: "career" | "identity" | "assets";
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReflection {
  id: string;
  week: string; // 'YYYY-Www'
  went_well: string;
  to_improve: string;
  created_at: string;
  updated_at: string;
}

export interface QuarterlyGoal {
  id: string;
  quarter: string; // 'YYYY-Qn' (예: '2026-Q1')
  text: string;
  pillar: "career" | "identity" | "assets";
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubGoal {
  id: string;
  pillar: "career" | "identity" | "assets";
  name: string;
  positioning: string | null;
  annual_target: string | null;
  quarterly_target: string | null;
  monthly_target: string | null;
  achievement_rate: number;
  retrospective: string | null;
  deadline: string | null;
  daily_practice: string | null;
  weekly_practice: string | null;
  monthly_practice: string | null;
  practice_time: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Pillar = "career" | "identity" | "assets";
