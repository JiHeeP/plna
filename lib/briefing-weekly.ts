import { getISOWeekString } from "./utils";

/**
 * 월요일 아침 브리핑용 '지난주 점검' 데이터.
 * 기준일(date)이 속한 ISO 주의 바로 앞 주(월~일)를 계산한다.
 * 해석·목표 제안은 호출자(Claude)가 담당하고, 여기서는 숫자만 만든다.
 */

type HabitRow = { id?: unknown; name?: unknown };
type HabitLogRow = { habit_id?: unknown; date?: unknown; completed?: unknown };
type TodoRow = { date?: unknown; text?: unknown; completed?: unknown; category?: unknown };
type GoalRow = { text?: unknown; pillar?: unknown; completed?: unknown; sort_order?: unknown };

export type LastWeekReview = {
  week: string;
  start: string;
  end: string;
  is_week_start: boolean;
  habits: {
    completed: number;
    possible: number;
    rate: number | null;
    by_habit: Array<{ name: string; completed_days: number }>;
  };
  todos: {
    completed: number;
    total: number;
    rate: number | null;
    incomplete: Array<{ date: string; text: string; category: string | null }>;
  };
  weekly_goals: {
    completed: number;
    total: number;
    rate: number | null;
    list: Array<{ text: string; pillar: string | null; completed: boolean }>;
  };
};

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** 1=월 … 7=일 */
function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function localDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function rate(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 1000) / 10 : null;
}

/** 기준일이 속한 주의 '지난주' 월요일·일요일·주차 문자열. */
export function previousWeekRange(date: string) {
  const mondayThisWeek = shiftDate(date, -(isoWeekday(date) - 1));
  const start = shiftDate(mondayThisWeek, -7);
  const end = shiftDate(mondayThisWeek, -1);
  return { start, end, week: getISOWeekString(localDate(start)) };
}

export function buildLastWeekReview(input: {
  date: string;
  habits: HabitRow[];
  habitLogs: HabitLogRow[];
  todos: TodoRow[];
  weeklyGoals: GoalRow[];
  displayName?: (name: string) => string;
}): LastWeekReview {
  const { start, end, week } = previousWeekRange(input.date);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  const inRange = (value: unknown) => {
    const d = String(value ?? "");
    return d >= start && d <= end;
  };
  const display = input.displayName ?? ((name: string) => name);

  const activeIds = new Set(input.habits.map((h) => String(h.id ?? "")));
  const doneByHabit = new Map<string, Set<string>>();
  for (const log of input.habitLogs) {
    if (log.completed === false || !inRange(log.date)) continue;
    const id = String(log.habit_id ?? "");
    if (!activeIds.has(id)) continue;
    if (!doneByHabit.has(id)) doneByHabit.set(id, new Set());
    doneByHabit.get(id)!.add(String(log.date));
  }
  const byHabit = input.habits.map((h) => ({
    name: display(String(h.name ?? "")),
    completed_days: doneByHabit.get(String(h.id ?? ""))?.size ?? 0,
  }));
  const habitDone = byHabit.reduce((sum, h) => sum + h.completed_days, 0);
  const habitPossible = input.habits.length * days.length;

  const weekTodos = input.todos.filter((t) => inRange(t.date));
  const todoDone = weekTodos.filter((t) => t.completed === true).length;
  const incomplete = weekTodos
    .filter((t) => t.completed !== true)
    .map((t) => ({
      date: String(t.date ?? ""),
      text: String(t.text ?? ""),
      category: t.category == null ? null : String(t.category),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const goals = [...input.weeklyGoals]
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((g) => ({
      text: String(g.text ?? ""),
      pillar: g.pillar == null ? null : String(g.pillar),
      completed: g.completed === true,
    }));
  const goalsDone = goals.filter((g) => g.completed).length;

  return {
    week,
    start,
    end,
    is_week_start: isoWeekday(input.date) === 1,
    habits: {
      completed: habitDone,
      possible: habitPossible,
      rate: rate(habitDone, habitPossible),
      by_habit: byHabit,
    },
    todos: {
      completed: todoDone,
      total: weekTodos.length,
      rate: rate(todoDone, weekTodos.length),
      incomplete,
    },
    weekly_goals: {
      completed: goalsDone,
      total: goals.length,
      rate: rate(goalsDone, goals.length),
      list: goals,
    },
  };
}
