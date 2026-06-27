import { createClient } from "@/lib/firebase/server";
import { NextRequest, NextResponse } from "next/server";

const MILESTONE_STATUSES = new Set([
  "not_started",
  "in_progress",
  "completed",
  "abandoned",
]);

export async function GET() {
  try {
    const supabase = await createClient();

    const [milestones, targets, logs, topics, subGoals] = await Promise.all([
      supabase.from("milestones").select("*").order("timeframe").order("created_at", { ascending: true }),
      supabase.from("numeric_targets").select("*"),
      supabase.from("numeric_logs").select("*").order("date"),
      supabase.from("conversation_topics").select("id"),
      supabase.from("sub_goals").select("*").eq("is_active", true).order("pillar").order("sort_order"),
    ]);

    return NextResponse.json({
      milestones: milestones.data ?? [],
      targets: targets.data ?? [],
      logs: logs.data ?? [],
      topicCount: topics.data?.length ?? 0,
      subGoals: subGoals.data ?? [],
    });
  } catch (e) {
    console.error("Goals API error:", e);
    return NextResponse.json({
      milestones: [],
      targets: [],
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

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  if (body.type !== "milestone") {
    return NextResponse.json({ error: "unsupported goal mutation" }, { status: 400 });
  }

  if (!body.id || !MILESTONE_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "id and valid status are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("milestones")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
