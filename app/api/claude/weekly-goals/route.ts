import { NextRequest, NextResponse } from "next/server";

import { authorizeClaude, isWeekString, parseGoalPatch, parseWeeklyGoalCreate, readJson } from "@/lib/claude-api";
import { createClient } from "@/lib/firebase/server";
import { getISOWeekString } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(auth: { status: number; message: string }) {
  return NextResponse.json({ error: auth.message }, { status: auth.status });
}

/** GET /api/claude/weekly-goals?week=YYYY-Www — 주간 목표 목록(기본: 이번 주). */
export async function GET(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const requested = request.nextUrl.searchParams.get("week");
  if (requested && !isWeekString(requested)) {
    return NextResponse.json({ error: "week는 YYYY-Www 형식이어야 합니다." }, { status: 400 });
  }
  const week = requested || getISOWeekString(new Date());

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_goals")
    .select("*")
    .eq("week", week)
    .order("sort_order")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ week, goals: data ?? [] });
}

/** POST /api/claude/weekly-goals — 주간 목표 추가. body: { week, text, pillar } */
export async function POST(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const parsed = parseWeeklyGoalCreate(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const { count } = await supabase
    .from("weekly_goals")
    .select("id", { count: "exact", head: true })
    .eq("week", parsed.value.week);

  const { data, error } = await supabase
    .from("weekly_goals")
    .insert({ ...parsed.value, sort_order: count ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data });
}

/** PATCH /api/claude/weekly-goals — 문구·완료 여부만 수정. body: { id, text?, completed? } */
export async function PATCH(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const parsed = parseGoalPatch(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { id, ...updates } = parsed.value;
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_goals")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id, updates });
}
