import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const [milestones, targets, logs, topics] = await Promise.all([
      supabase.from("milestones").select("*").order("timeframe").order("created_at", { ascending: true }),
      supabase.from("numeric_targets").select("*"),
      supabase.from("numeric_logs").select("*").order("date"),
      supabase.from("conversation_topics").select("id"),
    ]);

    return NextResponse.json({
      milestones: milestones.data ?? [],
      targets: targets.data ?? [],
      logs: logs.data ?? [],
      topicCount: topics.data?.length ?? 0,
    });
  } catch (e) {
    console.error("Goals API error:", e);
    return NextResponse.json({
      milestones: [],
      targets: [],
      logs: [],
      topicCount: 0,
    });
  }
}
