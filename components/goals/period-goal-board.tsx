"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pillar } from "@/lib/types";
import {
  Check,
  CheckCircle2,
  Circle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { PillarBoard } from "./pillar-board";

type PeriodGoal = {
  id: string;
  text: string;
  pillar: Pillar;
  completed: boolean;
  sort_order: number;
};

type PeriodConfig = {
  title: string;
  /** API 경로이자 기간 쿼리 파라미터 이름 */
  endpoint: string;
  param: "quarter" | "month";
  current: () => string;
  shift: (period: string, delta: number) => string;
  label: (period: string) => string;
};

const QUARTER: PeriodConfig = {
  title: "분기 목표",
  endpoint: "/api/quarterly-goals",
  param: "quarter",
  current: () => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  },
  shift: (quarter, delta) => {
    const [year, q] = quarter.split("-Q").map(Number);
    const index = year * 4 + (q - 1) + delta;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  },
  label: (quarter) => {
    const [year, q] = quarter.split("-");
    return `${year}년 ${q}`;
  },
};

const MONTH: PeriodConfig = {
  title: "이번달 목표",
  endpoint: "/api/monthly-goals",
  param: "month",
  current: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },
  shift: (month, delta) => {
    const [year, m] = month.split("-").map(Number);
    const index = year * 12 + (m - 1) + delta;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  },
  label: (month) => {
    const [year, m] = month.split("-");
    return `${year}년 ${Number(m)}월`;
  },
};

export function QuarterGoalBoard() {
  return <PeriodGoalBoard config={QUARTER} />;
}

export function MonthGoalBoard() {
  return <PeriodGoalBoard config={MONTH} />;
}

function PeriodGoalBoard({ config }: { config: PeriodConfig }) {
  const { title, endpoint, param } = config;
  const [period, setPeriod] = useState(config.current);
  const [goals, setGoals] = useState<PeriodGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?${param}=${period}`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, param, period]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`${title} 수정 실패:`, res.status);
    return res.ok;
  };

  const toggleCompleted = async (goal: PeriodGoal) => {
    await patch({ id: goal.id, completed: !goal.completed });
    load();
  };

  const saveEdit = async (id: string) => {
    const text = editingText.trim();
    if (!text) return;
    await patch({ id, text });
    setEditingId(null);
    load();
  };

  const addGoal = async (pillar: Pillar, text: string) => {
    if (!text.trim()) return;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, pillar, [param]: period }),
    });
    if (!res.ok) console.error(`${title} 저장 실패:`, res.status);
    load();
  };

  const deleteGoal = async (id: string) => {
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) console.error(`${title} 삭제 실패:`, res.status);
    load();
  };

  const handleReorder = async (items: { id: string; pillar: string; sort_order: number }[]) => {
    await Promise.all(items.map((item) => patch(item)));
    load();
  };

  const completedCount = goals.filter((g) => g.completed).length;

  const header = (
    <div className="flex items-center gap-2">
      {goals.length > 0 && (
        <Badge variant="secondary" className="text-xs">
          {completedCount}/{goals.length}
        </Badge>
      )}
      <Button
        variant={editMode ? "default" : "ghost"}
        size="icon-xs"
        onClick={() => {
          setEditMode((v) => !v);
          setEditingId(null);
        }}
        title={editMode ? "수정 완료" : "수정 모드"}
      >
        {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPeriod((p) => config.shift(p, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[5.5rem] text-center">
          {config.label(period)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPeriod((p) => config.shift(p, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          {header}
        </div>
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
    <PillarBoard<PeriodGoal>
      title={title}
      items={goals}
      onReorder={handleReorder}
      headerRight={header}
      renderCard={(goal) => (
        <div className="bg-white rounded-lg shadow-sm border p-3 pl-7 group">
          {editingId === goal.id ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(goal.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(goal.id)}>
                저장
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => toggleCompleted(goal)} className="flex-shrink-0">
                {goal.completed ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
                ) : (
                  <Circle className="h-4.5 w-4.5 text-gray-400" />
                )}
              </button>
              <span
                onClick={() => {
                  if (!editMode) return;
                  setEditingId(goal.id);
                  setEditingText(goal.text);
                }}
                className={`text-sm flex-1 min-w-0 ${
                  goal.completed ? "line-through text-muted-foreground" : ""
                } ${editMode ? "cursor-text underline decoration-dotted underline-offset-4" : ""}`}
              >
                {goal.text}
              </span>
              <button
                onClick={() => deleteGoal(goal.id)}
                className={`${
                  editMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                } transition-opacity flex-shrink-0`}
                title="삭제"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
              </button>
            </div>
          )}
        </div>
      )}
      renderAddForm={(pillar, onClose) => (
        <AddGoalForm
          placeholder={`${title}를 입력하세요`}
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

function AddGoalForm({
  placeholder,
  onSave,
  onCancel,
}: {
  placeholder: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="bg-white rounded-lg shadow-sm border p-2 space-y-2">
      <Input
        autoFocus
        placeholder={placeholder}
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
