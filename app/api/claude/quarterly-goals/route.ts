import { NextRequest, NextResponse } from "next/server";

import { authorizeClaude, isQuarterString, parseGoalPatch, readJson } from "@/lib/claude-api";
import { createClient } from "@/lib/firebase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(auth: { status: number; message: string }) {
  return NextResponse.json({ error: auth.message }, { status: auth.status });
}

function currentQuarter(now = new Date()) {
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}

/** GET /api/claude/quarterly-goals?quarter=YYYY-Qn — 분기 목표 목록(기본: 이번 분기). */
export async function GET(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const requested = request.nextUrl.searchParams.get("quarter");
  if (requested && !isQuarterString(requested)) {
    return NextResponse.json({ error: "quarter는 YYYY-Qn 형식이어야 합니다." }, { status: 400 });
  }
  const quarter = requested || currentQuarter();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarterly_goals")
    .select("*")
    .eq("quarter", quarter)
    .order("sort_order")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quarter, goals: data ?? [] });
}

/** PATCH /api/claude/quarterly-goals — 문구·완료 여부만 수정. body: { id, text?, completed? } (추가는 사용자가 직접) */
export async function PATCH(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const parsed = parseGoalPatch(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { id, ...updates } = parsed.value;
  const supabase = await createClient();
  const { error } = await supabase
    .from("quarterly_goals")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id, updates });
}
