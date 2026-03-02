import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";
import { getISOWeekString, getWeekDatesFromStr, toDateString } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const week = req.nextUrl.searchParams.get("week") || getISOWeekString(new Date());

    const dates = getWeekDatesFromStr(week);
    const startDate = toDateString(dates[0]);
    const endDate = toDateString(dates[6]);

    const [habitsRes, logsRes, journalsRes, goalsRes, reflectionRes] = await Promise.all([
      supabase.from("daily_habits").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("habit_logs").select("*").gte("date", startDate).lte("date", endDate).eq("completed", true),
      supabase.from("daily_journals").select("*").gte("date", startDate).lte("date", endDate),
      supabase.from("weekly_goals").select("*").eq("week", week).order("sort_order"),
      supabase.from("weekly_reflections").select("*").eq("week", week).single(),
    ]);

    const habits = habitsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const totalHabitsPerDay = habits.length;

    const dailyData = dates.map((d) => {
      const dateStr = toDateString(d);
      const dayLogs = logs.filter((l) => l.date === dateStr);
      const journal = (journalsRes.data ?? []).find((j) => j.date === dateStr);

      return {
        date: dateStr,
        habitRate: totalHabitsPerDay > 0
          ? Math.round((dayLogs.length / totalHabitsPerDay) * 100)
          : 0,
        habitCompleted: dayLogs.length,
        habitTotal: totalHabitsPerDay,
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
    return NextResponse.json({
      week: req.nextUrl.searchParams.get("week") || "",
      dailyData: [],
      weeklyGoals: [],
      reflection: null,
    });
  }
}
