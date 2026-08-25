import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import {
  deleteDailyTodo,
  patchDailyTodo,
  writeDailyTodo,
} from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";
import { isTodoCategory, normalizeTodoCategory } from "@/lib/todo-category";

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

  const rows = (data ?? []).map((row) => ({
    ...row,
    category: normalizeTodoCategory(row.category),
  }));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  const category = normalizeTodoCategory(body.category);
  const sortOrder = Number(body.sort_order);
  const targetDate = typeof body.date === "string" ? body.date : new Date().toISOString().split("T")[0];
  const id = typeof body.id === "string" && body.id.trim() && !body.id.includes("/")
    ? body.id.trim()
    : undefined;

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const data = await writeDailyTodo({
      id,
      date: targetDate,
      text,
      category,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });

    await recordDailyWriteAudit({
      target: "todo",
      action: "create",
      status: "success",
      date: targetDate,
      recordId: String(data.id),
      metadata: {
        has_text: true,
        category,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "todo",
      action: "create",
      status: "error",
      date: targetDate,
      recordId: id,
      errorMessage: message,
      metadata: {
        has_text: true,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

  if ("category" in body) {
    if (!isTodoCategory(body.category)) {
      return NextResponse.json(
        { error: "category must be 'school' or 'personal'" },
        { status: 400 },
      );
    }
    patch.category = body.category;
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

  try {
    await patchDailyTodo({
      id: String(id),
      date: auditDate,
      ...patch,
    });

    await recordDailyWriteAudit({
      target: "todo",
      action: "update",
      status: "success",
      date: auditDate,
      recordId: String(id),
      metadata: {
        updates_completed: "completed" in body,
        updates_text: "text" in body,
        updates_category: "category" in body,
        updates_sort_order: "sort_order" in body,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "todo",
      action: "update",
      status: "error",
      date: auditDate,
      recordId: String(id),
      errorMessage: message,
      metadata: {
        updates_completed: "completed" in body,
        updates_text: "text" in body,
        updates_sort_order: "sort_order" in body,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const auditDate = request.nextUrl.searchParams.get("date");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteDailyTodo(id);

    await recordDailyWriteAudit({
      target: "todo",
      action: "delete",
      status: "success",
      date: auditDate,
      recordId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "todo",
      action: "delete",
      status: "error",
      date: auditDate,
      recordId: id,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
