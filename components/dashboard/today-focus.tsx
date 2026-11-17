"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PILLAR_COLORS, PILLAR_TEXT_COLORS } from "@/lib/constants";

// 필러 칸 바탕색(옅은 틴트). 할 일이 있는 칸만 칠한다.
const PILLAR_TILE_STYLES: Record<string, string> = {
  career: "bg-career-soft/70 border-career-tint",
  identity: "bg-identity-soft/70 border-identity-tint",
  assets: "bg-assets-soft/70 border-assets-tint",
};
import { TODO_PILLARS, TODO_PILLAR_SHORT_LABELS, summarizeWeeklyPillars } from "@/lib/todo-pillar";
import type { DailyTodo, WeeklyGoal } from "@/lib/types";

/**
 * 홈 맨 위 '오늘의 초점' 카드.
 * 삶의 3필러별로 오늘 할 일 진행과 이번 주 목표를 한 장에 묶어,
 * 앱을 열자마자 "오늘 어느 필러가 비었나"가 보이게 한다.
 * 할 일은 홈의 할 일 목록이 넘겨주는 값을 그대로 쓴다(따로 불러오지 않음).
 */
export function TodayFocusCard({
  week,
  todos,
  isToday,
}: {
  week: string;
  todos: DailyTodo[];
  isToday: boolean;
}) {
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/weekly-goals?week=${week}`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      setGoals([]);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  const { pillars } = summarizeWeeklyPillars(todos, goals);
  const goalDone = goals.filter((g) => g.completed).length;
  const dayLabel = isToday ? "오늘" : "이날";

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base lg:text-lg">{dayLabel}의 초점</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {pillars.map((row) => {
            const empty = row.todoTotal === 0;
            const pct = empty ? 0 : Math.round((row.todoCompleted / row.todoTotal) * 100);
            return (
              <div
                key={row.pillar}
                className={`rounded-xl border p-2.5 lg:p-3 space-y-2 ${empty ? "border-dashed bg-muted/30" : PILLAR_TILE_STYLES[row.pillar]}`}
              >
                <div className={`text-xs lg:text-sm font-semibold ${PILLAR_TEXT_COLORS[row.pillar]}`}>
                  {TODO_PILLAR_SHORT_LABELS[row.pillar]}
                </div>
                {empty ? (
                  <div className="text-xs lg:text-sm text-muted-foreground leading-tight">
                    할 일 없음
                  </div>
                ) : (
                  <div className="text-lg lg:text-2xl font-bold leading-none">
                    {row.todoCompleted}
                    <span className="text-xs lg:text-sm font-normal text-muted-foreground"> / {row.todoTotal}</span>
                  </div>
                )}
                <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${PILLAR_COLORS[row.pillar]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {goals.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs lg:text-sm text-muted-foreground">
              <span>이번 주 목표</span>
              <span>
                {goalDone}/{goals.length}
              </span>
            </div>
            {TODO_PILLARS.flatMap((pillar) => goals.filter((g) => g.pillar === pillar)).map((goal) => (
              <div key={goal.id} className="flex items-center gap-2 py-0.5">
                {goal.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-identity flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={`text-sm lg:text-base flex-1 ${goal.completed ? "line-through text-muted-foreground" : ""}`}
                >
                  {goal.text}
                </span>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${PILLAR_COLORS[goal.pillar]}`} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs lg:text-sm text-muted-foreground">
            이번 주 목표가 없어요.{" "}
            <Link href="/goals" className="text-primary underline underline-offset-2">
              목표 탭에서 정하기
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
