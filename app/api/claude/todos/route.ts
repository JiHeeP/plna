import { NextRequest, NextResponse } from "next/server";

import { authorizeClaude, parseDateRange, parseTodoCreate, parseTodoPatch, readJson } from "@/lib/claude-api";
import { patchDailyTodo, writeDailyTodo } from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";
import { createClient } from "@/lib/firebase/server";
import { normalizeTodoCategory } from "@/lib/todo-category";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(auth: { status: number; message: string }) {
  return NextResponse.json({ error: auth.message }, { status: auth.status });
}

/** GET /api/claude/todos?from=YYYY-MM-DD&to=YYYY-MM-DD — 날짜 범위의 할 일(최대 31일). 이월은 하지 않는다. */
export async function GET(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const range = parseDateRange(
    request.nextUrl.searchParams.get("from"),
    request.nextUrl.searchParams.get("to"),
  );
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_todos")
    .select("*")
    .gte("date", range.value.from)
    .lte("date", range.value.to)
    .order("date")
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const todos = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    category: normalizeTodoCategory(row.category),
  }));
  return NextResponse.json({ from: range.value.from, to: range.value.to, todos });
}

/** POST /api/claude/todos — 할 일 1개 추가. body: { date, text, category?, sort_order? } */
export async function POST(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const parsed = parseTodoCreate(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const row = await writeDailyTodo(parsed.value);
    await recordDailyWriteAudit({
      target: "todo",
      action: "create",
      status: "success",
      date: parsed.value.date,
      recordId: String(row.id),
      metadata: { source: "claude", category: parsed.value.category },
    }).catch(() => undefined);
    return NextResponse.json({ todo: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/** PATCH /api/claude/todos — 할 일 수정. body: { id, text?, completed?, date?, category?, sort_order? } */
export async function PATCH(request: NextRequest) {
  const auth = authorizeClaude(request);
  if (!auth.ok) return deny(auth);

  const parsed = parseTodoPatch(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const patch = await patchDailyTodo(parsed.value);
    await recordDailyWriteAudit({
      target: "todo",
      action: "update",
      status: "success",
      date: parsed.value.date ?? null,
      recordId: parsed.value.id,
      metadata: {
        source: "claude",
        fields: Object.keys(parsed.value).filter((k) => k !== "id").join(","),
      },
    }).catch(() => undefined);
    return NextResponse.json({ todo: patch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
