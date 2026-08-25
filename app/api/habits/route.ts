import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { writeHabitLog } from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";
import { displayHabitName } from "@/lib/habit-display";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date =
    request.nextUrl.searchParams.get("date") ||
    new Date().toISOString().split("T")[0];
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  const { data: habits, error: habitsError } = await supabase
    .from("daily_habits")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (habitsError) {
    return NextResponse.json({ error: habitsError.message }, { status: 500 });
  }

  const displayHabits = (habits || []).map((habit) => ({
    ...habit,
    name: displayHabitName(String(habit.name ?? "")),
  }));

  if (start || end) {
    let logsQuery = supabase
      .from("habit_logs")
      .select("*")
      .eq("completed", true);

    if (start) logsQuery = logsQuery.gte("date", start);
    if (end) logsQuery = logsQuery.lte("date", end);

    const { data: logs, error: logsError } = await logsQuery;

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    return NextResponse.json({
      habits: displayHabits,
      logs: logs || [],
    });
  }

  const { data: logs, error: logsError } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("date", date)
    .eq("completed", true);

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const merged = displayHabits.map((habit) => ({
    ...habit,
    log: logs?.find((log) => log.habit_id === habit.id) || null,
  }));

  return NextResponse.json(merged);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "").trim();

  if (!name || !category) {
    return NextResponse.json(
      { error: "name and category are required" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("daily_habits")
    .select("sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? Number(existing[0].sort_order ?? 0) + 1 : 1;
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

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { habit_id, date, completed } = body;

  if (!habit_id || !date) {
    return NextResponse.json(
      { error: "habit_id and date are required" },
      { status: 400 },
    );
  }

  try {
    await writeHabitLog({
      habit_id: String(habit_id),
      date: String(date),
      completed: completed === true,
    });

    await recordDailyWriteAudit({
      target: "habit_log",
      action: completed ? "upsert" : "delete",
      status: "success",
      date,
      recordId: String(habit_id),
      metadata: {
        completed: completed === true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDailyWriteAudit({
      target: "habit_log",
      action: completed ? "upsert" : "delete",
      status: "error",
      date,
      recordId: String(habit_id),
      errorMessage: message,
      metadata: {
        completed: completed === true,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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
