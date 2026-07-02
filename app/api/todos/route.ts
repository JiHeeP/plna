import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";

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
  const targetDate = typeof body.date === "string" ? body.date : new Date().toISOString().split("T")[0];
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
      date: targetDate,
      text,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .select()
    .single();

  if (error) {
    await recordDailyWriteAudit({
      target: "todo",
      action: "create",
      status: "error",
      date: targetDate,
      recordId: id,
      errorMessage: error.message,
      metadata: {
        has_text: true,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordDailyWriteAudit({
    target: "todo",
    action: "create",
    status: "success",
    date: targetDate,
    recordId: String(data?.id ?? id ?? ""),
    metadata: {
      has_text: true,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
  });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { id } = body;
  const auditDate = typeof body.date === "string" ? body.date : null;

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
    await recordDailyWriteAudit({
      target: "todo",
      action: "update",
      status: "error",
      date: auditDate,
      recordId: String(id),
      errorMessage: error.message,
      metadata: {
        updates_completed: "completed" in body,
        updates_text: "text" in body,
        updates_sort_order: "sort_order" in body,
      },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordDailyWriteAudit({
    target: "todo",
    action: "update",
    status: "success",
    date: auditDate,
    recordId: String(id),
    metadata: {
      updates_completed: "completed" in body,
      updates_text: "text" in body,
      updates_sort_order: "sort_order" in body,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("id");
  const auditDate = request.nextUrl.searchParams.get("date");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("daily_todos")
    .delete()
    .eq("id", id);

  if (error) {
    await recordDailyWriteAudit({
      target: "todo",
      action: "delete",
      status: "error",
      date: auditDate,
      recordId: id,
      errorMessage: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordDailyWriteAudit({
    target: "todo",
    action: "delete",
    status: "success",
    date: auditDate,
    recordId: id,
  });

  return NextResponse.json({ success: true });
}
