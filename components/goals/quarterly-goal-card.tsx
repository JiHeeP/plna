"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QuarterlyGoal } from "@/lib/types";
import { PILLAR_LABELS, PILLAR_COLORS } from "@/lib/constants";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PILLAR_OPTIONS: { value: QuarterlyGoal["pillar"]; label: string }[] = [
  { value: "career", label: "일" },
  { value: "identity", label: "나다운나" },
  { value: "assets", label: "자산" },
];

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

function formatQuarterLabel(quarter: string) {
  const [year, q] = quarter.split("-");
  return `${year}년 ${q}`;
}

function shiftQuarter(quarter: string, delta: number) {
  const [year, qStr] = quarter.split("-");
  const q = parseInt(qStr.replace("Q", ""));
  let newQ = q + delta;
  let newYear = parseInt(year);
  while (newQ < 1) {
    newQ += 4;
    newYear -= 1;
  }
  while (newQ > 4) {
    newQ -= 4;
    newYear += 1;
  }
  return `${newYear}-Q${newQ}`;
}

export function QuarterlyGoalCard() {
  const [quarter, setQuarter] = useState(getCurrentQuarter);
  const [goals, setGoals] = useState<QuarterlyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newPillar, setNewPillar] = useState<QuarterlyGoal["pillar"]>("career");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quarterly-goals?quarter=${quarter}`, {
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
  }, [quarter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCompleted = async (goal: QuarterlyGoal) => {
    await fetch("/api/quarterly-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id, completed: !goal.completed }),
    });
    load();
  };

  const addGoal = async () => {
    if (!newText.trim()) return;
    await fetch("/api/quarterly-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText, pillar: newPillar, quarter }),
    });
    setNewText("");
    setShowForm(false);
    load();
  };

  const deleteGoal = async (id: string) => {
    await fetch("/api/quarterly-goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const completedCount = goals.filter((g) => g.completed).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">분기 목표</h2>
        {goals.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {completedCount}/{goals.length}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQuarter((q) => shiftQuarter(q, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-sm font-semibold">
                {formatQuarterLabel(quarter)}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQuarter((q) => shiftQuarter(q, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="h-3 w-3 mr-1" />
              추가
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2">
          {showForm && (
            <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg">
              <Input
                placeholder="분기 목표를 입력하세요"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGoal()}
                className="h-8 text-sm"
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {PILLAR_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setNewPillar(p.value)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        newPillar === p.value
                          ? `${PILLAR_COLORS[p.value]} text-white`
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <Button size="sm" className="h-7 text-xs" onClick={addGoal}>
                  저장
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              이번 분기 목표를 설정해보세요
            </p>
          ) : (
            <div className="space-y-1">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <button onClick={() => toggleCompleted(goal)}>
                    {goal.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm ${goal.completed ? "line-through text-muted-foreground" : ""}`}
                    >
                      {goal.text}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] flex-shrink-0"
                  >
                    {PILLAR_LABELS[goal.pillar]}
                  </Badge>
                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
