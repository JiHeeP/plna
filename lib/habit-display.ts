// Firestore daily_habits에 저장된 이름을 바꾸지 않고 표시 단계에서만 새 이름으로 매핑한다.
const HABIT_DISPLAY_RENAMES: Record<string, string> = {
  "문해력 증진 방법 연구": "연구",
  "코딩/AI 다루기": "ai",
  "코딩": "ai",
};

export function displayHabitName(name: string) {
  return HABIT_DISPLAY_RENAMES[name] ?? name;
}
