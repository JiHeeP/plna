"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_HABITS } from "@/lib/constants";
import type { DailyHabit, HabitLog } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekDates(): Date[] {
  const today = new Date();
  const day = today.getDay(); // 0=일, 1=월 ...
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const CATEGORY_COLORS: Record<string, string> = {
  health: "bg-emerald-400",
  career: "bg-blue-400",
  assets: "bg-amber-400",
  identity: "bg-teal-400",
};

export function WeeklyHabitGrid() {
  const [habits, setHabits] = useState<DailyHabit[]>([]);
  const [weekLogs, setWeekLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);

  const today = toDateString(new Date());
  const weekDates = useMemo(() => getWeekDates(), []);
  const weekStart = toDateString(weekDates[0]);
  const weekEnd = toDateString(weekDates[6]);

  const loadData = useCallback(async () => {
    const supabase = createClient();

    try {
      const { data: habitsData, error: habitsError } = await supabase
        .from("daily_habits")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (habitsError) throw habitsError;

      const { data: logsData, error: logsError } = await supabase
        .from("habit_logs")
        .select("*")
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .eq("completed", true);

      if (logsError) throw logsError;

      setHabits(habitsData || []);
      setWeekLogs(logsData || []);
      setUseLocal(false);
    } catch {
      setUseLocal(true);
      const localHabits: DailyHabit[] = DEFAULT_HABITS.map((h, i) => ({
        id: `local_${i}`,
        name: h.name,
        name_en: h.name_en,
        category: h.category,
        sort_order: h.sort_order,
        is_active: true,
        created_at: "",
      }));
      setHabits(localHabits);

      const logs: HabitLog[] = [];
      weekDates.forEach((d) => {
        const dateStr = toDateString(d);
        const saved = localStorage.getItem(`habits_${dateStr}`);
        if (saved) {
          const checked: Record<string, boolean> = JSON.parse(saved);
          localHabits.forEach((habit) => {
            if (checked[habit.name_en]) {
              logs.push({
                id: `log_${habit.id}_${dateStr}`,
                habit_id: habit.id,
                date: dateStr,
                completed: true,
                value: null,
                created_at: "",
              });
            }
          });
        }
      });
      setWeekLogs(logs);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, weekDates]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCompleted = useCallback(
    (habitId: string, date: string) =>
      weekLogs.some((l) => l.habit_id === habitId && l.date === date),
    [weekLogs]
  );

  const toggleHabit = async (habit: DailyHabit, date: string) => {
    const completed = isCompleted(habit.id, date);
    const newCompleted = !completed;

    if (newCompleted) {
      setWeekLogs((prev) => [
        ...prev,
        {
          id: `temp_${habit.id}_${date}`,
          habit_id: habit.id,
          date,
          completed: true,
          value: null,
          created_at: "",
        },
      ]);
    } else {
      setWeekLogs((prev) =>
        prev.filter((l) => !(l.habit_id === habit.id && l.date === date))
      );
    }

    if (useLocal) {
      const saved = localStorage.getItem(`habits_${date}`);
      const localChecked: Record<string, boolean> = saved
        ? JSON.parse(saved)
        : {};
      if (newCompleted) {
        localChecked[habit.name_en] = true;
      } else {
        delete localChecked[habit.name_en];
      }
      localStorage.setItem(`habits_${date}`, JSON.stringify(localChecked));
      return;
    }

    const supabase = createClient();
    if (newCompleted) {
      await supabase.from("habit_logs").upsert(
        { habit_id: habit.id, date, completed: true },
        { onConflict: "habit_id,date" }
      );
    } else {
      await supabase
        .from("habit_logs")
        .delete()
        .eq("habit_id", habit.id)
        .eq("date", date);
    }
  };

  const weekTotal = habits.length * 7;
  const weekCompletedCount = weekLogs.length;
  const weekPct =
    weekTotal > 0 ? Math.round((weekCompletedCount / weekTotal) * 100) : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-6 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">주간 습관 달성률</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* 날짜 헤더 */}
        <div className="flex items-end mb-2">
          <div className="flex-1" />
          <div className="flex gap-1.5">
            {weekDates.map((d, i) => {
              const dateStr = toDateString(d);
              const isToday = dateStr === today;
              return (
                <div
                  key={i}
                  className={`w-7 text-center text-xs ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-[10px]">{d.getDate()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 습관별 행 */}
        {habits.map((habit) => (
          <div
            key={habit.id}
            className="flex items-center py-2 gap-2"
          >
            <span className="flex-1 text-sm">{habit.name}</span>
            <div className="flex gap-1.5">
              {weekDates.map((d, i) => {
                const dateStr = toDateString(d);
                const done = isCompleted(habit.id, dateStr);
                const isFuture = dateStr > today;
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={isFuture}
                    onClick={() => toggleHabit(habit, dateStr)}
                    className="flex items-center justify-center w-7"
                    title={`${habit.name} - ${DAY_LABELS[i]}`}
                  >
                    <div
                      className={`w-5 h-5 rounded-sm transition-all ${
                        isFuture
                          ? "bg-muted/50"
                          : done
                            ? CATEGORY_COLORS[habit.category]
                            : "bg-muted"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* 주간 통계 */}
        <div className="pt-3 mt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">이번 주</span>
            <span className="font-medium">
              {weekCompletedCount}/{weekTotal} ({weekPct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-1.5">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${weekPct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
