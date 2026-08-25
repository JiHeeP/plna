export const TODO_CATEGORIES = ["school", "personal"] as const;

export type TodoCategory = (typeof TODO_CATEGORIES)[number];

export const TODO_CATEGORY_LABELS: Record<TodoCategory, string> = {
  school: "학교",
  personal: "개인",
};

// 카테고리 도입 전 데이터에는 category 필드가 없으므로 "개인"으로 취급한다.
export function normalizeTodoCategory(value: unknown): TodoCategory {
  return value === "school" ? "school" : "personal";
}

export function isTodoCategory(value: unknown): value is TodoCategory {
  return value === "school" || value === "personal";
}
