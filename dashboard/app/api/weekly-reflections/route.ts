import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getISOWeekString } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const week = req.nextUrl.searchParams.get("week") || getISOWeekString(new Date());

    const { data, error } = await supabase
      .from("weekly_reflections")
      .select("*")
      .eq("week", week)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return NextResponse.json(data || null);
  } catch (e) {
    console.error("Weekly reflections GET error:", e);
    return NextResponse.json(null);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { week, went_well, to_improve } = body;
    const targetWeek = week || getISOWeekString(new Date());

    const { data, error } = await supabase
      .from("weekly_reflections")
      .upsert(
        {
          week: targetWeek,
          went_well: went_well ?? "",
          to_improve: to_improve ?? "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "week" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    console.error("Weekly reflections POST error:", e);
    return NextResponse.json({ error: "회고 저장 실패" }, { status: 500 });
  }
}
