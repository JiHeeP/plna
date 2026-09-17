import { SITE_PROFILE, type SiteProfile } from "./site-profile";

/** 저장소에 존재할 수 있는 모든 카테고리 키. 프로필마다 이 중 두 개를 골라 쓴다. */
export const ALL_TODO_CATEGORIES = ["school", "personal", "group"] as const;

export type TodoCategory = (typeof ALL_TODO_CATEGORIES)[number];

export const TODO_CATEGORY_LABELS: Record<TodoCategory, string> = {
  school: "학교",
  personal: "개인",
  group: "모임",
};

export const TODO_CATEGORY_ICONS: Record<TodoCategory, string> = {
  school: "🏫",
  personal: "🏠",
  group: "👥",
};

export function todoCategoriesFor(profile: SiteProfile): readonly TodoCategory[] {
  return profile === "mom" ? ["personal", "group"] : ["school", "personal"];
}

/** 이 배포에서 화면에 보이는 카테고리 (순서대로). */
export const TODO_CATEGORIES = todoCategoriesFor(SITE_PROFILE);

export function isTodoCategory(
  value: unknown,
  categories: readonly TodoCategory[] = TODO_CATEGORIES,
): value is TodoCategory {
  return typeof value === "string" && (categories as readonly string[]).includes(value);
}

// 카테고리 도입 전 데이터에는 category 필드가 없고, 프로필이 바뀌면 낯선 키가 남을 수 있다.
// 어느 경우든 "개인"으로 취급한다. "개인"은 모든 프로필에 있다.
export function normalizeTodoCategory(
  value: unknown,
  categories: readonly TodoCategory[] = TODO_CATEGORIES,
): TodoCategory {
  return isTodoCategory(value, categories) ? value : "personal";
}

/** Record<TodoCategory, T>를 모든 키로 채워 만든다. 화면은 TODO_CATEGORIES만 돌지만 타입은 전체 키를 요구한다. */
export function emptyByCategory<T>(make: () => T): Record<TodoCategory, T> {
  return { school: make(), personal: make(), group: make() };
}
