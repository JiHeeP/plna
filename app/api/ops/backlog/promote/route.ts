import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { toDateString } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const backlogId = body.backlogId as string | undefined;
    const targetDate = (body.targetDate as string | undefined) ?? toDateString(new Date());

    if (!backlogId) {
      return NextResponse.json({ ok: false, error: "backlogId is required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("promote_backlog_item_to_todo", {
      p_backlog_id: backlogId,
      p_target_date: targetDate,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, promoted: data?.[0] ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
