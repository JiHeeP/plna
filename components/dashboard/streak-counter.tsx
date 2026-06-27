"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";
import type { DailyHabit, HabitLog } from "@/lib/types";

export function StreakCounter() {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStreak() {
      try {
        const today = new Date();

        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const start = thirtyDaysAgo.toISOString().split("T")[0];
        const end = today.toISOString().split("T")[0];
        const response = await fetch(
          `/api/habits?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const { habits, logs } = (await response.json()) as {
          habits: Pick<DailyHabit, "id">[];
          logs: Pick<HabitLog, "date" | "completed">[];
        };

        if (!habits || habits.length === 0) {
          setLoading(false);
          return;
        }

        const totalHabits = habits.length;

        if (!logs) {
          setLoading(false);
          return;
        }

        const dateMap: Record<string, number> = {};
        logs.forEach((log) => {
          dateMap[log.date] = (dateMap[log.date] || 0) + 1;
        });

        let currentStreak = 0;
        const checkDate = new Date(today);

        while (true) {
          const dateStr = checkDate.toISOString().split("T")[0];
          if ((dateMap[dateStr] || 0) >= totalHabits) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        setStreak(currentStreak);
      } catch {
        setStreak(0);
      } finally {
        setLoading(false);
      }
    }

    loadStreak();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-10 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <div>
            <p className="text-lg lg:text-xl font-bold">
              {streak > 0 ? `${streak}일 연속` : "오늘부터 시작!"}
            </p>
            <p className="text-xs lg:text-sm text-muted-foreground">
              전체 습관 완료 스트릭
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
