import { NextRequest, NextResponse } from "next/server";

import { authorizeClaude, parseDateRange } from "@/lib/claude-api";
import { createClient } from "@/lib/firebase/server";
import { getISOWeekString } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function weeksInRange(from: string, to: string) {
  const weeks = new Set<string>();
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    weeks.add(getISOWeekString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weeks;
}

/**
 * GET /api/claude/records?from=YYYY-MM-DD&to=YYYY-MM-DD — 읽기 전용(최대 31일).
 * 습관 목록 + 완료 기록, 저널, 일기, 대화 기록, 주간 회고를 한 번에 돌려준다.
 * 쓰기·수정·삭제는 없다.
 */
export async function GET(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const range = parseDateRange(
    request.nextUrl.searchParams.get("from"),
    request.nextUrl.searchParams.get("to"),
  );
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });
  const { from, to } = range.value;

  const supabase = await createClient();
  const byDate = (table: string) =>
    supabase.from(table).select("*").gte("date", from).lte("date", to).order("date");

  const [habits, habitLogs, journals, diaries, conversations, reflections] = await Promise.all([
    supabase.from("daily_habits").select("*").order("sort_order"),
    byDate("habit_logs"),
    byDate("daily_journals"),
    byDate("daily_diaries"),
    byDate("conversations"),
    supabase.from("weekly_reflections").select("*"),
  ]);

  const failed = [habits, habitLogs, journals, diaries, conversations, reflections].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const weeks = weeksInRange(from, to);
  return NextResponse.json({
    from,
    to,
    habits: habits.data ?? [],
    habit_logs: ((habitLogs.data ?? []) as Row[]).filter((row) => row.completed === true),
    journals: journals.data ?? [],
    diaries: diaries.data ?? [],
    conversations: conversations.data ?? [],
    weekly_reflections: ((reflections.data ?? []) as Row[]).filter((row) => weeks.has(String(row.week))),
  });
}
