export const PILLAR_LABELS: Record<string, string> = {
  career: "일 (커리어)",
  identity: "나다운 나",
  assets: "자산",
};

export const PILLAR_COLORS: Record<string, string> = {
  career: "bg-blue-500",
  identity: "bg-emerald-500",
  assets: "bg-amber-500",
};

export const PILLAR_TEXT_COLORS: Record<string, string> = {
  career: "text-blue-600",
  identity: "text-emerald-600",
  assets: "text-amber-600",
};

export const DEFAULT_HABITS = [
  { name: "기상 6시", name_en: "wake_up", category: "health", sort_order: 1 },
  { name: "운동 30분", name_en: "exercise", category: "health", sort_order: 2 },
  { name: "명상 5분", name_en: "meditation", category: "health", sort_order: 3 },
  { name: "연구대회 2시간", name_en: "research", category: "career", sort_order: 4 },
  { name: "코딩/AI 다루기", name_en: "coding", category: "assets", sort_order: 5 },
  { name: "대화 기록", name_en: "conversation_log", category: "identity", sort_order: 6 },
  { name: "책 읽기", name_en: "reading", category: "identity", sort_order: 7 },
] as const;

export const AFFIRMATIONS = [
  "내 생에 단 하루뿐인 오늘이 시작되었습니다.",
  "나는 불행보다 행복을 선택합니다.",
  "나는 있는 그대로의 나를 받아들이고 인정합니다.",
  "나는 나만의 속도대로 조용히, 그러나 분명히 나아가고 있습니다.",
  "나는 예상치 못한 순간에도 나의 중심을 지킵니다.",
  "나는 눈 앞에 있는 사람이 나처럼 소중한 사람임을 잊지 않습니다.",
  "나는 작지만 단단한 걸음을 내딛으며 오늘을 시작하겠습니다.",
];

export const YEAR_START = new Date(2026, 0, 1);
