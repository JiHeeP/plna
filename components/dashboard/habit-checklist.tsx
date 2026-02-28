"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_HABITS } from "@/lib/constants";
import type { DailyHabit, HabitLog } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HabitChecklist({ date }: { date?: string }) {
  const [habits, setHabits] = useState<DailyHabit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

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
        .eq("date", targetDate)
        .eq("completed", true);

      if (logsError) throw logsError;

      setHabits(habitsData || []);
      setLogs(logsData || []);
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

      const saved = localStorage.getItem(`habits_${targetDate}`);
      if (saved) {
        const checked: Record<string, boolean> = JSON.parse(saved);
        const restored: HabitLog[] = localHabits
          .filter((habit) => checked[habit.name_en])
          .map((habit) => ({
            id: `log_${habit.id}_${targetDate}`,
            habit_id: habit.id,
            date: targetDate,
            completed: true,
            value: null,
            created_at: "",
          }));
        setLogs(restored);
      } else {
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCompleted = useCallback(
    (habitId: string) =>
      logs.some((l) => l.habit_id === habitId && l.date === targetDate),
    [logs, targetDate]
  );

  const toggleHabit = async (habit: DailyHabit) => {
    const completed = isCompleted(habit.id);
    const newCompleted = !completed;

    if (newCompleted) {
      setLogs((prev) => [
        ...prev,
        {
          id: `temp_${habit.id}_${targetDate}`,
          habit_id: habit.id,
          date: targetDate,
          completed: true,
          value: null,
          created_at: "",
        },
      ]);
    } else {
      setLogs((prev) =>
        prev.filter((l) => !(l.habit_id === habit.id && l.date === targetDate))
      );
    }

    if (useLocal) {
      const saved = localStorage.getItem(`habits_${targetDate}`);
      const localChecked: Record<string, boolean> = saved
        ? JSON.parse(saved)
        : {};
      if (newCompleted) {
        localChecked[habit.name_en] = true;
      } else {
        delete localChecked[habit.name_en];
      }
      localStorage.setItem(`habits_${targetDate}`, JSON.stringify(localChecked));
      return;
    }

    const supabase = createClient();
    if (newCompleted) {
      await supabase.from("habit_logs").upsert(
        { habit_id: habit.id, date: targetDate, completed: true },
        { onConflict: "habit_id,date" }
      );
    } else {
      await supabase
        .from("habit_logs")
        .delete()
        .eq("habit_id", habit.id)
        .eq("date", targetDate);
    }
  };

  const completedCount = habits.filter((h) => isCompleted(h.id)).length;
  const totalCount = habits.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">습관</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{totalCount} 완료
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {habits.map((habit) => (
          <label
            key={habit.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent cursor-pointer"
          >
            <Checkbox
              checked={isCompleted(habit.id)}
              onCheckedChange={() => toggleHabit(habit)}
            />
            <span
              className={
                isCompleted(habit.id)
                  ? "line-through text-muted-foreground"
                  : ""
              }
            >
              {habit.name}
            </span>
          </label>
        ))}
        <div className="pt-3">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
