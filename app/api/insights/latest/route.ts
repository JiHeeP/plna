import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type InsightSnapshot = {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  wentWell: string;
  toImprove: string;
  nextFocus: string;
  metrics: {
    habitCompletionRate: number;
    todoCompletionRate: number;
  };
};

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  return {
    start: toDateString(start),
    end: toDateString(end),
  };
}

function getNextFocus(habitRate: number, todoRate: number) {
  if (habitRate < 60 && habitRate <= todoRate) {
    return "핵심 습관 1~2개를 고정 시간에 먼저 완료해 루틴을 안정화해보세요.";
  }

  if (todoRate < 60 && todoRate < habitRate) {
    return "할 일을 3개 이내로 압축하고 우선순위 1번부터 마감 시간을 정해 실행해보세요.";
  }

  return "유지하고 있는 흐름을 이어가기 위해 지금의 페이스를 다음 달 핵심 과제로 연결해보세요.";
}

async function buildSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  period: "weekly" | "monthly",
  days: number
): Promise<InsightSnapshot | null> {
  const dateRange = getDateRange(days);

  const [
    { data: journals, error: journalError },
    { data: habits, error: habitsError },
    { data: habitLogs, error: habitLogsError },
    { data: todos, error: todosError },
  ] = await Promise.all([
    supabase
      .from("daily_journals")
      .select("date, accomplishments, went_well, to_improve")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .order("date", { ascending: false }),
    supabase.from("daily_habits").select("id").eq("is_active", true),
    supabase
      .from("habit_logs")
      .select("id")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .eq("completed", true),
    supabase
      .from("daily_todos")
      .select("id, completed")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end),
  ]);

  if (journalError || habitsError || habitLogsError || todosError) {
    return null;
  }

  const habitTotal = (habits?.length || 0) * days;
  const habitCompleted = habitLogs?.length || 0;
  const todoTotal = todos?.length || 0;
  const todoCompleted = todos?.filter((todo) => todo.completed).length || 0;

  const hasAnyData =
    (journals?.length || 0) > 0 || habitCompleted > 0 || todoTotal > 0;

  if (!hasAnyData) return null;

  const habitCompletionRate =
    habitTotal > 0 ? Math.round((habitCompleted / habitTotal) * 100) : 0;
  const todoCompletionRate =
    todoTotal > 0 ? Math.round((todoCompleted / todoTotal) * 100) : 0;

  const latestJournal = journals?.[0];

  return {
    period,
    dateRange,
    wentWell:
      latestJournal?.went_well ||
      latestJournal?.accomplishments ||
      "아직 기록된 내용이 없습니다.",
    toImprove: latestJournal?.to_improve || "아직 기록된 내용이 없습니다.",
    nextFocus: getNextFocus(habitCompletionRate, todoCompletionRate),
    metrics: {
      habitCompletionRate,
      todoCompletionRate,
    },
  };
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ weekly: null, monthly: null });
  }

  try {
    const supabase = await createClient();
    const [weekly, monthly] = await Promise.all([
      buildSnapshot(supabase, "weekly", 7),
      buildSnapshot(supabase, "monthly", 30),
    ]);

    return NextResponse.json({ weekly, monthly });
  } catch {
    return NextResponse.json({ weekly: null, monthly: null });
  }
}
