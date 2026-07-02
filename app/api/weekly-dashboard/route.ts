import { createClient } from "@/lib/firebase/server";
import { NextResponse, NextRequest } from "next/server";
import { getISOWeekString, getWeekDatesFromStr, toDateString } from "@/lib/utils";

function dateToWeek(date: string | undefined) {
  if (!date) return null;
  return getISOWeekString(new Date(`${date}T00:00:00`));
}

function maxString(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

async function resolveDashboardWeek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedWeek: string | null,
) {
  if (requestedWeek) return { week: requestedWeek, error: null };

  const [logsRes, journalsRes, todosRes, goalsRes, reflectionsRes] = await Promise.all([
    supabase.from("habit_logs").select("date"),
    supabase.from("daily_journals").select("date"),
    supabase.from("daily_todos").select("date"),
    supabase.from("weekly_goals").select("week"),
    supabase.from("weekly_reflections").select("week"),
  ]);

  const dashboardError =
    logsRes.error ? { source: "habit_logs", error: logsRes.error } :
    journalsRes.error ? { source: "daily_journals", error: journalsRes.error } :
    todosRes.error ? { source: "daily_todos", error: todosRes.error } :
    goalsRes.error ? { source: "weekly_goals", error: goalsRes.error } :
    reflectionsRes.error ? { source: "weekly_reflections", error: reflectionsRes.error } :
      null;

  if (dashboardError) {
    return { week: null, error: dashboardError };
  }

  const latestWeek = maxString([
    ...(logsRes.data ?? []).map((item) => dateToWeek(item.date)),
    ...(journalsRes.data ?? []).map((item) => dateToWeek(item.date)),
    ...(todosRes.data ?? []).map((item) => dateToWeek(item.date)),
    ...(goalsRes.data ?? []).map((item) => item.week),
    ...(reflectionsRes.data ?? []).map((item) => item.week),
  ]);

  return { week: latestWeek ?? getISOWeekString(new Date()), error: null };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const resolved = await resolveDashboardWeek(supabase, req.nextUrl.searchParams.get("week"));

    if (resolved.error) {
      console.error("Weekly dashboard query error:", resolved.error.source, resolved.error.error);
      return NextResponse.json(
        {
          error: resolved.error.error.message,
          source: resolved.error.source,
        },
        { status: 500 },
      );
    }

    const week = resolved.week ?? getISOWeekString(new Date());

    const dates = getWeekDatesFromStr(week);
    const startDate = toDateString(dates[0]);
    const endDate = toDateString(dates[6]);

    const [habitsRes, logsRes, journalsRes, todosRes, goalsRes, reflectionRes] = await Promise.all([
      supabase.from("daily_habits").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("habit_logs").select("*").gte("date", startDate).lte("date", endDate).eq("completed", true),
      supabase.from("daily_journals").select("*").gte("date", startDate).lte("date", endDate),
      supabase.from("daily_todos").select("*").gte("date", startDate).lte("date", endDate).order("date").order("sort_order").order("created_at"),
      supabase.from("weekly_goals").select("*").eq("week", week).order("sort_order"),
      supabase.from("weekly_reflections").select("*").eq("week", week).single(),
    ]);

    const dashboardError =
      habitsRes.error ? { source: "daily_habits", error: habitsRes.error } :
      logsRes.error ? { source: "habit_logs", error: logsRes.error } :
      journalsRes.error ? { source: "daily_journals", error: journalsRes.error } :
      todosRes.error ? { source: "daily_todos", error: todosRes.error } :
      goalsRes.error ? { source: "weekly_goals", error: goalsRes.error } :
      reflectionRes.error?.code !== "PGRST116" && reflectionRes.error
        ? { source: "weekly_reflections", error: reflectionRes.error }
        : null;

    if (dashboardError) {
      console.error("Weekly dashboard query error:", dashboardError.source, dashboardError.error);
      return NextResponse.json(
        {
          error: dashboardError.error.message,
          source: dashboardError.source,
        },
        { status: 500 },
      );
    }

    const habits = habitsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const todos = todosRes.data ?? [];
    const totalHabitsPerDay = habits.length;

    const dailyData = dates.map((d) => {
      const dateStr = toDateString(d);
      const dayLogs = logs.filter((l) => l.date === dateStr);
      const journal = (journalsRes.data ?? []).find((j) => j.date === dateStr);
      const dayTodos = todos.filter((todo) => todo.date === dateStr);

      return {
        date: dateStr,
        habitRate: totalHabitsPerDay > 0
          ? Math.round((dayLogs.length / totalHabitsPerDay) * 100)
          : 0,
        habitCompleted: dayLogs.length,
        habitTotal: totalHabitsPerDay,
        todoCompleted: dayTodos.filter((todo) => todo.completed).length,
        todoTotal: dayTodos.length,
        todos: dayTodos.map((todo) => ({
          id: todo.id,
          text: todo.text,
          completed: Boolean(todo.completed),
        })),
        accomplishments: journal?.accomplishments ?? "",
        went_well: journal?.went_well ?? "",
        to_improve: journal?.to_improve ?? "",
      };
    });

    return NextResponse.json({
      week,
      dailyData,
      weeklyGoals: goalsRes.data ?? [],
      reflection: reflectionRes.error?.code === "PGRST116" ? null : reflectionRes.data,
    });
  } catch (e) {
    console.error("Weekly dashboard GET error:", e);
    return NextResponse.json(
      {
        error: "Weekly dashboard data load failed",
        week: req.nextUrl.searchParams.get("week") || "",
        dailyData: [],
        weeklyGoals: [],
        reflection: null,
      },
      { status: 500 },
    );
  }
}
