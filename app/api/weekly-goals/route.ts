import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getISOWeekString } from "@/lib/utils";

function getCurrentWeek() {
  return getISOWeekString(new Date());
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const week = req.nextUrl.searchParams.get("week") || getCurrentWeek();

    const { data, error } = await supabase
      .from("weekly_goals")
      .select("*")
      .eq("week", week)
      .order("sort_order")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ goals: data ?? [] });
  } catch (e) {
    console.error("Weekly goals GET error:", e);
    return NextResponse.json({ goals: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { text, pillar, week } = body;

    if (!text?.trim() || !pillar) {
      return NextResponse.json({ error: "text와 pillar는 필수입니다" }, { status: 400 });
    }

    const targetWeek = week || getCurrentWeek();

    const { count } = await supabase
      .from("weekly_goals")
      .select("id", { count: "exact", head: true })
      .eq("week", targetWeek);

    const { data, error } = await supabase
      .from("weekly_goals")
      .insert({
        week: targetWeek,
        text: text.trim(),
        pillar,
        sort_order: count ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (e) {
    console.error("Weekly goals POST error:", e);
    return NextResponse.json({ error: "목표 생성 실패" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }

    const { error } = await supabase
      .from("weekly_goals")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Weekly goals PATCH error:", e);
    return NextResponse.json({ error: "목표 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }

    const { error } = await supabase
      .from("weekly_goals")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Weekly goals DELETE error:", e);
    return NextResponse.json({ error: "목표 삭제 실패" }, { status: 500 });
  }
}
