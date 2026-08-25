"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_HABITS } from "@/lib/constants";
import {
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
  LOCAL_DAILY_BACKUP_SYNC_EVENT,
} from "@/lib/local-daily-backup";
import type { DailyHabit, HabitLog, HabitWithLog } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CATEGORY_OPTIONS = [
  { value: "health", label: "건강" },
  { value: "career", label: "커리어" },
  { value: "identity", label: "나다운 나" },
  { value: "assets", label: "자산" },
] as const;

const REFRESH_MS = 5 * 60 * 1000;

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

  const readLocalHabitChecks = useCallback(() => {
    const saved = localStorage.getItem(`habits_${targetDate}`);
    if (saved === null) return null;

    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, boolean>
        : {};
    } catch {
      return {};
    }
  }, [targetDate]);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(`/api/habits?date=${encodeURIComponent(targetDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // 서버가 진실의 원천: 위젯 창에서 체크한 습관도 그대로 따라간다.
      // localStorage 사본은 오프라인 폴백과 백업 sync용으로만 유지한다.
      const habitsData = (await response.json()) as HabitWithLog[];
      setHabits(habitsData);
      setLogs(
        habitsData
          .map((habit) => habit.log)
          .filter((log): log is HabitLog => Boolean(log?.completed)),
      );
      const checkedMap: Record<string, boolean> = {};
      habitsData.forEach((habit) => {
        if (habit.log?.completed) checkedMap[habit.name_en] = true;
      });
      localStorage.setItem(`habits_${targetDate}`, JSON.stringify(checkedMap));
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

      const checked = readLocalHabitChecks();
      if (checked !== null) {
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
  }, [readLocalHabitChecks, targetDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 위젯 창에서 체크한 습관이 메인 화면에도 따라오도록
  // 주기적으로, 창이 다시 보일 때, 로컬 백업 sync 직후에 다시 읽는다.
  useEffect(() => {
    if (editMode) return;

    const timer = setInterval(() => loadData(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    const onSynced = () => loadData();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, onSynced);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, onSynced);
    };
  }, [editMode, loadData]);

  const isCompleted = useCallback(
    (habitId: string) =>
      logs.some((l) => l.habit_id === habitId && l.date === targetDate),
    [logs, targetDate]
  );

  const saveLocalHabitCheck = (habitNameEn: string, completed: boolean, notify = true) => {
    const saved = localStorage.getItem(`habits_${targetDate}`);
    let localChecked: Record<string, boolean> = {};
    if (saved) {
      try {
        localChecked = JSON.parse(saved);
      } catch {
        localChecked = {};
      }
    }
    if (completed) {
      localChecked[habitNameEn] = true;
    } else {
      delete localChecked[habitNameEn];
    }
    localStorage.setItem(`habits_${targetDate}`, JSON.stringify(localChecked));
    if (notify) {
      window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_CHANGED_EVENT));
    }
  };

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
    saveLocalHabitCheck(habit.name_en, newCompleted, false);

    if (useLocal) {
      saveLocalHabitCheck(habit.name_en, newCompleted);
      return;
    }

    try {
      const response = await fetch("/api/habits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habit_id: habit.id,
          date: targetDate,
          completed: newCompleted,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      saveLocalHabitCheck(habit.name_en, newCompleted);
    } catch {
      setUseLocal(true);
      saveLocalHabitCheck(habit.name_en, newCompleted);
    }
  };

  const addHabit = async () => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;

    const response = await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        category: newHabitCategory,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as DailyHabit;
      setHabits((prev) => [...prev, data]);
      setNewHabitName("");
      setShowAddForm(false);
    }
  };

  const removeHabit = async (habit: DailyHabit) => {
    const response = await fetch(`/api/habits?id=${encodeURIComponent(habit.id)}`, {
      method: "DELETE",
    });

    if (response.ok) {
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
