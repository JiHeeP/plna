import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const body = await request.json();
  const { date, accomplishments, to_improve, went_well } = body;

  const targetDate = date || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_journals")
    .upsert(
      {
        date: targetDate,
        accomplishments: accomplishments || "",
        to_improve: to_improve || "",
        went_well: went_well || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
