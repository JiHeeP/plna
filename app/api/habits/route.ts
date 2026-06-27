import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";

// GET /api/habits?date=2026-02-16
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date =
    request.nextUrl.searchParams.get("date") ||
    new Date().toISOString().split("T")[0];

  const { data: habits, error: habitsError } = await supabase
    .from("daily_habits")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (habitsError) {
    return NextResponse.json({ error: habitsError.message }, { status: 500 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("date", date);

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const merged = (habits || []).map((habit) => ({
    ...habit,
    log: logs?.find((log) => log.habit_id === habit.id) || null,
  }));

  return NextResponse.json(merged);
}

// POST /api/habits - 새 습관 추가
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { name, category } = body;

  if (!name || !category) {
    return NextResponse.json(
      { error: "name과 category가 필요합니다" },
      { status: 400 }
    );
  }

  // 현재 최대 sort_order 조회
  const { data: existing } = await supabase
    .from("daily_habits")
    .select("sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1;
  const nameEn = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const { data, error } = await supabase
    .from("daily_habits")
    .insert({
      name,
      name_en: nameEn || `habit_${Date.now()}`,
      category,
      sort_order: nextOrder,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH /api/habits - 습관 토글
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { habit_id, date, completed } = body;

  if (!habit_id || !date) {
    return NextResponse.json(
      { error: "habit_id와 date가 필요합니다" },
      { status: 400 }
    );
  }

  if (completed) {
    const { error } = await supabase.from("habit_logs").upsert(
      {
        habit_id,
        date,
        completed: true,
      },
      { onConflict: "habit_id,date" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("habit_logs")
      .delete()
      .eq("habit_id", habit_id)
      .eq("date", date);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/habits - 습관 비활성화 (soft delete)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("daily_habits")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
