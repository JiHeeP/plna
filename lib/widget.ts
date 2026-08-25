import { AFFIRMATIONS, YEAR_START } from "@/lib/constants";
import { normalizeTodoCategory, TODO_CATEGORY_LABELS } from "@/lib/todo-category";
import { getISOWeekString } from "@/lib/utils";
import type { Pillar } from "@/lib/types";

/** 위젯 응답의 최상위 형태. JSON 엔드포인트와 이미지 렌더러가 함께 쓴다. */
export interface WidgetSummary {
  date: string;
  label: string;
  weekday: string;
  dDay: number;
  week: string;
  habits: {
    done: number;
    total: number;
    percent: number;
    remaining: string[];
  };
  todos: {
    done: number;
    total: number;
    remaining: number;
    next: string[];
  };
  weeklyGoal: { text: string; pillar: Pillar; completed: boolean } | null;
  affirmation: string;
  generatedAt: string;
}

export interface WidgetSourceRows {
  habits: { id: string; name: string }[];
  habitLogs: { habit_id: string; completed?: boolean }[];
  todos: { text: string; completed?: boolean; category?: string; sort_order?: number }[];
  weeklyGoals: { text: string; pillar: Pillar; completed?: boolean; sort_order?: number }[];
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const MS_PER_DAY = 86400000;

/** 주어진 타임존 기준의 'YYYY-MM-DD'. 서버가 UTC여도 한국 날짜를 얻기 위해 필요하다. */
export function dateStringInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

export function resolveWidgetTimeZone() {
  return (
    process.env.PLNA_WIDGET_TIMEZONE ||
    process.env.DIGEST_TIMEZONE ||
    "Asia/Seoul"
  );
}

/** 'YYYY-MM-DD'를 로컬 자정 Date로 파싱. 타임존 보정 없이 달력상의 날짜만 다룬다. */
export function parseDateString(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** 홈 화면 헤더와 동일한 D+ 계산 (2026-01-01 = D+0). */
export function getDDay(date: string): number {
  const target = parseDateString(date);
  return Math.floor((target.getTime() - YEAR_START.getTime()) / MS_PER_DAY);
}

/** 날짜마다 고정된 확언을 고른다. 위젯이 갱신될 때마다 문구가 바뀌지 않도록 랜덤을 쓰지 않는다. */
export function pickAffirmation(date: string): string {
  const days = Math.floor(parseDateString(date).getTime() / MS_PER_DAY);
  const index = ((days % AFFIRMATIONS.length) + AFFIRMATIONS.length) % AFFIRMATIONS.length;
  return AFFIRMATIONS[index];
}

function clampText(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

function bySortOrder(a: { sort_order?: number }, b: { sort_order?: number }) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

// 이미지 위젯은 한글 폰트만 내려받으므로 이모지 대신 텍스트 라벨을 붙인다.
function todoLine(todo: { text: string; category?: string }, max: number) {
  const label = TODO_CATEGORY_LABELS[normalizeTodoCategory(todo.category)];
  return `[${label}] ${clampText(todo.text, max)}`;
}

export function buildWidgetSummary(
  date: string,
  rows: WidgetSourceRows,
  generatedAt: Date,
): WidgetSummary {
  const parsed = parseDateString(date);
  const completedHabitIds = new Set(
    rows.habitLogs.filter((log) => log.completed !== false).map((log) => log.habit_id),
  );
  const habitTotal = rows.habits.length;
  const habitDone = rows.habits.filter((habit) => completedHabitIds.has(habit.id)).length;

  const openTodos = [...rows.todos].filter((todo) => todo.completed !== true).sort(bySortOrder);
  const doneTodos = rows.todos.filter((todo) => todo.completed === true).length;

  const sortedGoals = [...rows.weeklyGoals].sort(bySortOrder);
  const focusGoal = sortedGoals.find((goal) => goal.completed !== true) ?? sortedGoals[0] ?? null;

  return {
    date,
    label: `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`,
    weekday: WEEKDAY_NAMES[parsed.getDay()],
    dDay: getDDay(date),
    week: getISOWeekString(parsed),
    habits: {
      done: habitDone,
      total: habitTotal,
      percent: habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : 0,
      remaining: rows.habits
        .filter((habit) => !completedHabitIds.has(habit.id))
        .map((habit) => clampText(habit.name, 20)),
    },
    todos: {
      done: doneTodos,
      total: rows.todos.length,
      remaining: openTodos.length,
      next: openTodos.slice(0, 3).map((todo) => todoLine(todo, 24)),
    },
    weeklyGoal: focusGoal
      ? {
          text: clampText(focusGoal.text, 34),
          pillar: focusGoal.pillar,
          completed: focusGoal.completed === true,
        }
      : null,
    affirmation: pickAffirmation(date),
  generatedAt: generatedAt.toISOString(),
  };
}

/**
 * 위젯 가운데 영역에 무엇을 띄울지 고른다. 남은 할 일 > 남은 습관 > 완료 순.
 * 확언은 항상 하단에만 두어 같은 문장이 두 번 나오지 않게 한다.
 */
export function describeNextUp(summary: WidgetSummary): { heading: string; lines: string[] } {
  if (summary.todos.remaining > 0) {
    return {
      heading: `남은 할 일 ${summary.todos.remaining}개`,
      lines: summary.todos.next.slice(0, 2),
    };
  }

  if (summary.habits.remaining.length > 0) {
    return {
      heading: `남은 습관 ${summary.habits.remaining.length}개`,
      lines: summary.habits.remaining.slice(0, 2),
    };
  }

  return {
    heading:
      summary.habits.total > 0 || summary.todos.total > 0 ? "오늘 할 일 완료" : "오늘 기록 없음",
    lines: [],
  };
}
