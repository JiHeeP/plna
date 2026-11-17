import { NextRequest, NextResponse } from "next/server";

import { authorizeClaude, isMonthString } from "@/lib/claude-api";
import { createClient } from "@/lib/firebase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/claude/monthly-goals?month=YYYY-MM — 월 목표 목록(기본: 이번 달). 읽기 전용.
 * 주간 목표를 월 목표에 연결할 때(monthly_goal_id) 쓸 id를 찾는 용도.
 */
export async function GET(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const requested = request.nextUrl.searchParams.get("month");
  if (requested && !isMonthString(requested)) {
    return NextResponse.json({ error: "month는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }
  const month = requested || currentMonth();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_goals")
    .select("*")
    .eq("month", month)
    .order("sort_order")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ month, goals: data ?? [] });
}
