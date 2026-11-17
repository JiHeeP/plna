import { createClient } from "@/lib/firebase/server";
import { NextRequest, NextResponse } from "next/server";

import { NUMERIC_GOAL_IDS, NUMERIC_GOALS } from "@/lib/numeric-goals";

export async function GET() {
  try {
    const supabase = await createClient();

    const [logs, topics, subGoals] = await Promise.all([
      // 현재 쓰는 수치 목표의 기록만 읽는다(예전 목표 기록까지 전부 읽지 않게).
      supabase.from("numeric_logs").select("*").in("target_id", [...NUMERIC_GOAL_IDS]).order("date"),
      // 개수만 필요하므로 문서를 읽지 않고 집계로 센다.
      supabase.from("conversation_topics").select("id", { count: "exact", head: true }),
      supabase.from("sub_goals").select("*").eq("is_active", true).order("pillar").order("sort_order"),
    ]);

    return NextResponse.json({
      targets: NUMERIC_GOALS,
      logs: (logs.data ?? []).filter((l) => NUMERIC_GOAL_IDS.has(String(l.target_id))),
      topicCount: topics.count ?? 0,
      subGoals: subGoals.data ?? [],
    });
  } catch (e) {
    console.error("Goals API error:", e);
    return NextResponse.json({
      targets: NUMERIC_GOALS,
      logs: [],
      topicCount: 0,
      subGoals: [],
    });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  if (body.type !== "numeric_log") {
    return NextResponse.json({ error: "unsupported goal mutation" }, { status: 400 });
  }

  const value = Number(body.value);
  if (!body.target_id || !Number.isFinite(value)) {
    return NextResponse.json({ error: "target_id and value are required" }, { status: 400 });
  }
  if (!NUMERIC_GOAL_IDS.has(String(body.target_id))) {
    return NextResponse.json({ error: "unknown numeric goal" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("numeric_logs")
    .insert({
      target_id: body.target_id,
      date: body.date || new Date().toISOString().split("T")[0],
      value,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
