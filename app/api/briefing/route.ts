import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/firebase/server";
import { displayHabitName } from "@/lib/habit-display";
import { getISOWeekString } from "@/lib/utils";
import {
  dateStringInTimeZone,
  parseDateString,
  resolveWidgetTimeZone,
} from "@/lib/widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type BriefingWarning = { source: string; message: string };

/** 브리핑 전용 토큰. 미설정 시 위젯 토큰을 재사용한다. */
function resolveBriefingToken() {
  const briefing = process.env.PLNA_BRIEFING_TOKEN?.trim();
  if (briefing) return briefing;
  const widget = process.env.PLNA_WIDGET_TOKEN?.trim();
  return widget || null;
}

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function authorize(request: NextRequest) {
  const expected = resolveBriefingToken();
  if (!expected) {
    return {
      ok: false as const,
      status: 503 as const,
      message:
        "PLNA_BRIEFING_TOKEN(또는 PLNA_WIDGET_TOKEN)이 설정되지 않아 브리핑 엔드포인트가 비활성화되어 있습니다.",
    };
  }

  const headerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const queryToken = request.nextUrl.searchParams.get("token")?.trim();
  const provided = headerToken || queryToken || "";

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false as const, status: 401 as const, message: "유효하지 않은 브리핑 토큰입니다." };
  }

  return { ok: true as const };
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function quarterString(date: string) {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

async function optionalQuery<T>(
  warnings: BriefingWarning[],
  source: string,
  fallback: T,
  query: () => Promise<T>,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    warnings.push({
      source,
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/**
 * GET /api/briefing — 아침 브리핑용 데이터 묶음.
 * 어제 습관·일기·저널, 오늘 할 일, 최근 7일 추세, 이번 주/월/분기 목표,
 * 마일스톤·서브 목표(비전)를 한 번에 반환한다. 해석·코멘트는 호출자(Claude)가 담당.
 */
export async function GET(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const requestedDate = request.nextUrl.searchParams.get("date");
  const timeZone = resolveWidgetTimeZone();
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : dateStringInTimeZone(new Date(), timeZone);

  const yesterday = shiftDate(date, -1);
  const sevenDaysAgo = shiftDate(date, -7);
  const thirtyDaysAgo = shiftDate(date, -30);
  const week = getISOWeekString(parseDateString(date));
  const previousWeek = getISOWeekString(parseDateString(shiftDate(date, -7)));
  const month = date.slice(0, 7);
  const quarter = quarterString(date);

  const warnings: BriefingWarning[] = [];
  const supabase = await createClient();

  const [
    habits,
    habitLogs,
    todos,
    journalYesterday,
    diaryYesterday,
    weeklyGoals,
    monthlyGoals,
    quarterlyGoals,
    milestones,
    subGoals,
    currentReflection,
    previousReflection,
  ] = await Promise.all([
    optionalQuery(warnings, "daily_habits", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("daily_habits")
        .select("id, name, category, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "habit_logs", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("habit_id, date, completed")
        .gte("date", thirtyDaysAgo)
        .lte("date", yesterday);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "daily_todos", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("daily_todos")
        .select("date, text, completed, category, sort_order")
        .gte("date", sevenDaysAgo)
        .lte("date", date);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "daily_journals", null as Row | null, async () => {
      const { data, error } = await supabase
        .from("daily_journals")
        .select("*")
        .eq("date", yesterday)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    }),
    optionalQuery(warnings, "daily_diaries", null as Row | null, async () => {
      const { data, error } = await supabase
        .from("daily_diaries")
        .select("*")
        .eq("date", yesterday)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    }),
    optionalQuery(warnings, "weekly_goals", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("weekly_goals")
        .select("text, pillar, completed, sort_order")
        .eq("week", week);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "monthly_goals", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("monthly_goals")
        .select("text, pillar, completed, sort_order")
        .eq("month", month);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "quarterly_goals", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("quarterly_goals")
        .select("text, pillar, completed, sort_order")
        .eq("quarter", quarter);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "milestones", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("milestones")
        .select("title, pillar, timeframe, status, target_date, notes");
      if (error) throw new Error(error.message);
      return (data ?? []).filter(
        (row: Row) => row.status === "in_progress" || row.status === "not_started",
      );
    }),
    optionalQuery(warnings, "sub_goals", [] as Row[], async () => {
      const { data, error } = await supabase
        .from("sub_goals")
        .select(
          "pillar, name, positioning, annual_target, quarterly_target, monthly_target, achievement_rate, retrospective, deadline, daily_practice, weekly_practice, monthly_practice, practice_time, sort_order",
        )
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    optionalQuery(warnings, "weekly_reflections_current", null as Row | null, async () => {
      const { data, error } = await supabase
        .from("weekly_reflections")
        .select("*")
        .eq("week", week)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    }),
    optionalQuery(warnings, "weekly_reflections_previous", null as Row | null, async () => {
      const { data, error } = await supabase
        .from("weekly_reflections")
        .select("*")
        .eq("week", previousWeek)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    }),
  ]);

  const completedByDate = new Map<string, Set<string>>();
  for (const log of habitLogs) {
    if (log.completed === false) continue;
    const key = String(log.date ?? "");
    if (!completedByDate.has(key)) completedByDate.set(key, new Set());
    completedByDate.get(key)!.add(String(log.habit_id ?? ""));
  }

  const habitReport = habits.map((habit: Row) => {
    const id = String(habit.id ?? "");
    let streakDays = 0;
    for (let offset = 1; offset <= 30; offset += 1) {
      if (completedByDate.get(shiftDate(date, -offset))?.has(id)) streakDays += 1;
      else break;
    }
    let completedLast7 = 0;
    for (let offset = 1; offset <= 7; offset += 1) {
      if (completedByDate.get(shiftDate(date, -offset))?.has(id)) completedLast7 += 1;
    }
    return {
      name: displayHabitName(String(habit.name ?? "")),
      category: habit.category ?? null,
      completed_yesterday: completedByDate.get(yesterday)?.has(id) ?? false,
      streak_days: streakDays,
      completed_last7_days: completedLast7,
    };
  });

  const bySortOrder = (a: Row, b: Row) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);

  const todosToday = todos
    .filter((todo: Row) => todo.date === date)
    .sort(bySortOrder)
    .map((todo: Row) => ({
      text: String(todo.text ?? ""),
      completed: todo.completed === true,
      category: todo.category ?? null,
    }));

  const todosYesterdayIncomplete = todos
    .filter((todo: Row) => todo.date === yesterday && todo.completed !== true)
    .sort(bySortOrder)
    .map((todo: Row) => ({
      text: String(todo.text ?? ""),
      category: todo.category ?? null,
    }));

  const dailyTrend = [] as Array<{
    date: string;
    habits_completed: number;
    habits_total: number;
    todos_completed: number;
    todos_total: number;
  }>;
  for (let offset = 7; offset >= 1; offset -= 1) {
    const day = shiftDate(date, -offset);
    const dayTodos = todos.filter((todo: Row) => todo.date === day);
    dailyTrend.push({
      date: day,
      habits_completed: completedByDate.get(day)?.size ?? 0,
      habits_total: habits.length,
      todos_completed: dayTodos.filter((todo: Row) => todo.completed === true).length,
      todos_total: dayTodos.length,
    });
  }

  const mapGoals = (rows: Row[]) =>
    [...rows].sort(bySortOrder).map((row: Row) => ({
      text: String(row.text ?? ""),
      pillar: row.pillar ?? null,
      completed: row.completed === true,
    }));

  const response = NextResponse.json({
    generated_at: new Date().toISOString(),
    timezone: timeZone,
    date,
    yesterday,
    week,
    month,
    quarter,
    habits: {
      list: habitReport,
      yesterday_completed: completedByDate.get(yesterday)?.size ?? 0,
      yesterday_total: habits.length,
    },
    todos: {
      today: todosToday,
      yesterday_incomplete: todosYesterdayIncomplete,
    },
    daily_trend_last7: dailyTrend,
    journal_yesterday: journalYesterday,
    diary_yesterday: diaryYesterday,
    goals: {
      weekly: mapGoals(weeklyGoals),
      monthly: mapGoals(monthlyGoals),
      quarterly: mapGoals(quarterlyGoals),
    },
    vision: {
      milestones,
      sub_goals: [...subGoals].sort(bySortOrder),
    },
    reflections: {
      current_week: currentReflection,
      previous_week: previousReflection,
    },
    warnings,
  });

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
