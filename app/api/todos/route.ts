import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  const sortOrder = Number(body.sort_order);
  const id = typeof body.id === "string" && body.id.trim() && !body.id.includes("/")
    ? body.id.trim()
    : undefined;

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_todos")
    .insert({
      id,
      date: body.date || new Date().toISOString().split("T")[0],
      text,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("completed" in body) {
    patch.completed = Boolean(body.completed);
  }

  if ("text" in body) {
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    patch.text = text;
  }

  if ("sort_order" in body) {
    const sortOrder = Number(body.sort_order);
    if (Number.isFinite(sortOrder)) {
      patch.sort_order = sortOrder;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no update fields provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("daily_todos")
    .update(patch)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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
