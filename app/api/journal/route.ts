import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { writeDailyJournal } from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";

// GET /api/journal?date=2026-02-26
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date =
    request.nextUrl.searchParams.get("date") ||
    new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_journals")
    .select("*")
    .eq("date", date)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || null);
}

// POST /api/journal - 저장 (upsert)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, accomplishments, to_improve, went_well } = body;

  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    const data = await writeDailyJournal({
      date: targetDate,
      accomplishments,
      to_improve,
      went_well,
    });

    await recordDailyWriteAudit({
      target: "journal",
      action: "upsert",
      status: "success",
      date: targetDate,
      recordId: String(data.id),
      metadata: {
        has_accomplishments: Boolean(accomplishments),
        has_went_well: Boolean(went_well),
        has_to_improve: Boolean(to_improve),
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "journal",
      action: "upsert",
      status: "error",
      date: targetDate,
      errorMessage: message,
      metadata: {
        has_accomplishments: Boolean(accomplishments),
        has_went_well: Boolean(went_well),
        has_to_improve: Boolean(to_improve),
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
