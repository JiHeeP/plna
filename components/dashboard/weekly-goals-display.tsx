"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WeeklyGoal } from "@/lib/types";
import { PILLAR_LABELS } from "@/lib/constants";
import { CheckCircle2, Circle } from "lucide-react";

export function WeeklyGoalsDisplay({ week }: { week: string }) {
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/weekly-goals?week=${week}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (goals.length === 0) return null;

  const completedCount = goals.filter((g) => g.completed).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">이번 주 목표</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {completedCount}/{goals.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {goals.map((goal) => (
          <div key={goal.id} className="flex items-center gap-2 p-1.5">
            {goal.completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
            <span
              className={`text-sm flex-1 ${goal.completed ? "line-through text-muted-foreground" : ""}`}
            >
              {goal.text}
            </span>
            <Badge variant="outline" className="text-[10px] flex-shrink-0">
              {PILLAR_LABELS[goal.pillar]}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
