"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/firebase/client";
import { DEFAULT_HABITS } from "@/lib/constants";
import type { DailyHabit, HabitLog } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CATEGORY_OPTIONS = [
  { value: "health", label: "건강" },
  { value: "career", label: "커리어" },
  { value: "identity", label: "나다운 나" },
  { value: "assets", label: "자산" },
] as const;

export function HabitChecklist({ date }: { date?: string }) {
  const [habits, setHabits] = useState<DailyHabit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitCategory, setNewHabitCategory] = useState<string>("health");

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

  const addHabit = async () => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("daily_habits")
      .insert({
        name: trimmed,
        name_en: trimmed.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || `habit_${Date.now()}`,
        category: newHabitCategory,
        sort_order: habits.length + 1,
        is_active: true,
      })
      .select()
      .single();

    if (!error && data) {
      setHabits((prev) => [...prev, data]);
      setNewHabitName("");
      setShowAddForm(false);
    }
  };

  const removeHabit = async (habit: DailyHabit) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("daily_habits")
      .update({ is_active: false })
      .eq("id", habit.id);

    if (!error) {
      setHabits((prev) => prev.filter((h) => h.id !== habit.id));
      setLogs((prev) => prev.filter((l) => l.habit_id !== habit.id));
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
          <CardTitle className="text-base lg:text-lg">습관</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm lg:text-base text-muted-foreground">
              {completedCount}/{totalCount} 완료
            </span>
            {!useLocal && (
              <Button
                variant={editMode ? "default" : "ghost"}
                size="icon-xs"
                onClick={() => {
                  setEditMode(!editMode);
                  if (editMode) setShowAddForm(false);
                }}
                title={editMode ? "편집 완료" : "습관 편집"}
              >
                {editMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {habits.map((habit) => (
          <div
            key={habit.id}
            className="flex items-center gap-2"
          >
            <label
              className="flex-1 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={isCompleted(habit.id)}
                onCheckedChange={() => toggleHabit(habit)}
                disabled={editMode}
              />
              <span
                className={`lg:text-base ${
                  isCompleted(habit.id)
                    ? "line-through text-muted-foreground"
                    : ""
                }`}
              >
                {habit.name}
              </span>
            </label>
            {editMode && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => removeHabit(habit)}
                title="삭제"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </Button>
            )}
          </div>
        ))}

        {editMode && !showAddForm && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowAddForm(true)}
          >
            + 새 습관 추가
          </Button>
        )}

        {editMode && showAddForm && (
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Input
              placeholder="습관 이름"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addHabit();
                if (e.key === "Escape") {
                  setShowAddForm(false);
                  setNewHabitName("");
                }
              }}
              autoFocus
            />
            <div className="flex gap-1 flex-wrap">
              {CATEGORY_OPTIONS.map((cat) => (
                <Button
                  key={cat.value}
                  variant={newHabitCategory === cat.value ? "default" : "outline"}
                  size="xs"
                  onClick={() => setNewHabitCategory(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={addHabit} disabled={!newHabitName.trim()}>
                추가
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewHabitName("");
                }}
              >
                취소
              </Button>
            </div>
          </div>
        )}

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
