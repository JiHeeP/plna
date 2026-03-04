import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const month = req.nextUrl.searchParams.get("month") || getCurrentMonth();

    const { data, error } = await supabase
      .from("monthly_goals")
      .select("*")
      .eq("month", month)
      .order("sort_order")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ goals: data ?? [] });
  } catch (e) {
    console.error("Monthly goals GET error:", e);
    return NextResponse.json({ goals: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { text, pillar, month } = body;

    if (!text?.trim() || !pillar) {
      return NextResponse.json({ error: "text와 pillar는 필수입니다" }, { status: 400 });
    }

    const targetMonth = month || getCurrentMonth();

    // 현재 목표 수로 sort_order 결정
    const { count } = await supabase
      .from("monthly_goals")
      .select("id", { count: "exact", head: true })
      .eq("month", targetMonth);

    const { data, error } = await supabase
      .from("monthly_goals")
      .insert({
        month: targetMonth,
        text: text.trim(),
        pillar,
        sort_order: count ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (e) {
    console.error("Monthly goals POST error:", e);
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
      .from("monthly_goals")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Monthly goals PATCH error:", e);
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
      .from("monthly_goals")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Monthly goals DELETE error:", e);
    return NextResponse.json({ error: "목표 삭제 실패" }, { status: 500 });
  }
}
