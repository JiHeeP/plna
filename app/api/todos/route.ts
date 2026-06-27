import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";

// GET /api/todos?date=2026-02-26
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date =
    request.nextUrl.searchParams.get("date") ||
    new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_todos")
    .select("*")
    .eq("date", date)
    .order("sort_order")
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/todos - 새 할 일 추가
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { date, text } = body;

  if (!text?.trim()) {
    return NextResponse.json(
      { error: "할 일 내용이 필요합니다" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("daily_todos")
    .insert({ date: date || new Date().toISOString().split("T")[0], text: text.trim() })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH /api/todos - 할 일 토글
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id, completed } = body;

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("daily_todos")
    .update({ completed })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/todos - 할 일 삭제
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("daily_todos")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
