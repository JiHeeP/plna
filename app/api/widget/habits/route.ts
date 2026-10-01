import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/firebase/server";
import { writeHabitLog } from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";
import { displayHabitName } from "@/lib/habit-display";
import {
  authorizeWidgetRequest,
  authorizeWidgetWrite,
  resolveWidgetDate,
} from "@/lib/widget-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 홈 화면 위젯이 체크박스를 그리고 누를 수 있게 하는 경로.
 *
 * 앱 화면이 쓰는 `/api/habits` 와 달리 쿠키가 아니라 토큰으로 인증한다.
 * 위젯은 브라우저가 아니라 쿠키를 가질 수 없기 때문이다.
 * - `GET` : 읽기 토큰(`PLNA_WIDGET_TOKEN`)
 * - `POST`: 쓰기 토큰(`PLNA_WIDGET_WRITE_TOKEN`)
 */
export async function GET(request: NextRequest) {
  const auth = authorizeWidgetRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const date = resolveWidgetDate(request.nextUrl.searchParams.get("date"));
  const supabase = await createClient();

  const { data: habits, error: habitsError } = await supabase
    .from("daily_habits")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (habitsError) {
    return NextResponse.json({ error: habitsError.message }, { status: 500 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("date", date)
    .eq("completed", true);

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const done = new Set((logs ?? []).map((log) => String(log.habit_id)));
  const items = (habits ?? []).map((habit) => ({
    id: String(habit.id),
    name: displayHabitName(String(habit.name ?? "")),
    completed: done.has(String(habit.id)),
  }));

  const response = NextResponse.json({ date, habits: items });
  // 체크 상태는 방금 누른 결과를 곧바로 다시 읽으므로 캐시하지 않는다.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const auth = authorizeWidgetWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const { habit_id: habitId, completed } = (body ?? {}) as {
    habit_id?: unknown;
    completed?: unknown;
  };
  const date = resolveWidgetDate(
    typeof (body as { date?: unknown })?.date === "string"
      ? String((body as { date?: unknown }).date)
      : null,
  );

  if (!habitId) {
    return NextResponse.json({ error: "habit_id 가 필요합니다." }, { status: 400 });
  }

  const nextCompleted = completed === true;

  try {
    await writeHabitLog({
      habit_id: String(habitId),
      date,
      completed: nextCompleted,
    });
    await recordDailyWriteAudit({
      target: "habit_log",
      action: nextCompleted ? "upsert" : "delete",
      status: "success",
      date,
      recordId: String(habitId),
      metadata: { completed: nextCompleted, source: "android-widget" },
    });
    return NextResponse.json({ success: true, habit_id: String(habitId), date, completed: nextCompleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "habit_log",
      action: nextCompleted ? "upsert" : "delete",
      status: "error",
      date,
      recordId: String(habitId),
      errorMessage: message,
      metadata: { completed: nextCompleted, source: "android-widget" },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
