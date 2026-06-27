import { createClient } from "@/lib/firebase/server";
import { NextResponse } from "next/server";

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
