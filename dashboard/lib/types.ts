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

export type Pillar = "career" | "identity" | "assets";
