"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QuarterlyGoal, Pillar } from "@/lib/types";
import {
  CheckCircle2,
  Circle,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PillarBoard } from "./pillar-board";

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
    const res = await fetch("/api/quarterly-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id, completed: !goal.completed }),
    });
    if (!res.ok) {
      console.error("분기목표 수정 실패:", res.status);
      return;
    }
    load();
  };

  const addGoal = async (pillar: Pillar, text: string) => {
    if (!text.trim()) return;
    const res = await fetch("/api/quarterly-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, pillar, quarter }),
    });
    if (!res.ok) {
      console.error("분기목표 저장 실패:", res.status);
      return;
    }
    load();
  };

  const deleteGoal = async (id: string) => {
    const res = await fetch("/api/quarterly-goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      console.error("분기목표 삭제 실패:", res.status);
      return;
    }
    load();
  };

  const handleReorder = async (items: { id: string; pillar: string; sort_order: number }[]) => {
    const res = await fetch("/api/quarterly-goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      console.error("재정렬 실패:", res.status);
    }
    load();
  };

  const completedCount = goals.filter((g) => g.completed).length;

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">분기 목표</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted/30 rounded-xl p-3 space-y-3">
              <div className="h-6 bg-muted animate-pulse rounded w-20" />
              <div className="h-12 bg-muted animate-pulse rounded" />
              <div className="h-12 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PillarBoard<QuarterlyGoal>
      title="분기 목표"
      items={goals}
      onReorder={handleReorder}
      headerRight={
        <div className="flex items-center gap-2">
          {goals.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {completedCount}/{goals.length}
            </Badge>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setQuarter((q) => shiftQuarter(q, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[5.5rem] text-center">
              {formatQuarterLabel(quarter)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setQuarter((q) => shiftQuarter(q, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      }
      renderCard={(goal) => (
        <div className="bg-white rounded-lg shadow-sm border p-3 pl-7 group">
          <div className="flex items-center gap-2">
            <button onClick={() => toggleCompleted(goal)} className="flex-shrink-0">
              {goal.completed ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
              ) : (
                <Circle className="h-4.5 w-4.5 text-gray-400" />
              )}
            </button>
            <span
              className={`text-sm flex-1 min-w-0 ${
                goal.completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {goal.text}
            </span>
            <button
              onClick={() => deleteGoal(goal.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
            </button>
          </div>
        </div>
      )}
      renderAddForm={(pillar, onClose) => (
        <AddQuarterlyGoalForm
          onSave={(text) => {
            addGoal(pillar, text);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    />
  );
}

function AddQuarterlyGoalForm({
  onSave,
  onCancel,
}: {
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="bg-white rounded-lg shadow-sm border p-2 space-y-2">
      <Input
        autoFocus
        placeholder="분기 목표를 입력하세요"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSave(text);
          if (e.key === "Escape") onCancel();
        }}
        className="h-8 text-sm"
      />
      <div className="flex justify-end gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => text.trim() && onSave(text)}>
          저장
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
