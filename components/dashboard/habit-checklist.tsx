"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_HABITS } from "@/lib/constants";
import type { DailyHabit, HabitLog } from "@/lib/types";

// ── 유틸 ──
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

// ── 메인 컴포넌트 ──
export function HabitChecklist() {
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

      // 로컬 모드: 이번 주 로그 복원
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

  // 특정 날짜의 특정 습관 완료 여부
  const isCompleted = useCallback(
    (habitId: string, date: string) =>
      weekLogs.some((l) => l.habit_id === habitId && l.date === date),
    [weekLogs]
  );

  // 토글 함수
  const toggleHabit = async (habit: DailyHabit, date: string) => {
    const completed = isCompleted(habit.id, date);
    const newCompleted = !completed;

    // 즉시 UI 업데이트
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

  // 오늘 통계
  const todayCompleted = habits.filter((h) => isCompleted(h.id, today)).length;
  const todayTotal = habits.length;
  const todayPct =
    todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  // 주간 통계
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
      <Tabs defaultValue="today">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">습관</CardTitle>
            <TabsList className="h-8">
              <TabsTrigger value="today" className="text-xs px-3 h-7">
                오늘
              </TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs px-3 h-7">
                주간
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        {/* ── 오늘 탭 ── */}
        <TabsContent value="today">
          <CardContent className="pt-0 space-y-1">
            <div className="flex items-center justify-end mb-1">
              <span className="text-sm text-muted-foreground">
                {todayCompleted}/{todayTotal} 완료
              </span>
            </div>
            {habits.map((habit) => (
              <label
                key={habit.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={isCompleted(habit.id, today)}
                  onCheckedChange={() => toggleHabit(habit, today)}
                />
                <span
                  className={
                    isCompleted(habit.id, today)
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
                  style={{ width: `${todayPct}%` }}
                />
              </div>
            </div>
          </CardContent>
        </TabsContent>

        {/* ── 주간 탭 ── */}
        <TabsContent value="weekly">
          <CardContent className="pt-0">
            {/* 날짜 헤더 */}
            <div className="grid grid-cols-[1fr_repeat(7,minmax(0,1fr))] gap-1 mb-2">
              <div />
              {weekDates.map((d, i) => {
                const dateStr = toDateString(d);
                const isToday = dateStr === today;
                return (
                  <div
                    key={i}
                    className={`text-center text-xs ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-[10px]">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* 습관별 행 */}
            {habits.map((habit) => (
              <div
                key={habit.id}
                className="grid grid-cols-[1fr_repeat(7,minmax(0,1fr))] gap-1 items-center py-1.5"
              >
                <span className="text-xs truncate pr-1">{habit.name}</span>
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
                      className="flex items-center justify-center"
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
        </TabsContent>
      </Tabs>
    </Card>
  );
}
