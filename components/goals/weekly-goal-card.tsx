"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WeeklyGoal } from "@/lib/types";
import { PILLAR_LABELS, PILLAR_COLORS } from "@/lib/constants";
import { getISOWeekString, shiftWeek, formatWeekLabel } from "@/lib/utils";
import { CheckCircle2, Circle, Plus, Trash2, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";

const PILLAR_OPTIONS: { value: WeeklyGoal["pillar"]; label: string }[] = [
  { value: "career", label: "일" },
  { value: "identity", label: "나다운나" },
  { value: "assets", label: "자산" },
];

function reorder<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const from = items.findIndex((x) => x.id === activeId);
  const to = items.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0 || from === to) return items;
  const cloned = [...items];
  const [moved] = cloned.splice(from, 1);
  cloned.splice(to, 0, moved);
  return cloned;
}

export function WeeklyGoalCard() {
  const [week, setWeek] = useState(() => getISOWeekString(new Date()));
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newPillar, setNewPillar] = useState<WeeklyGoal["pillar"]>("career");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/weekly-goals?week=${week}`, { cache: "no-store" });
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

  const persistOrder = async (ordered: WeeklyGoal[]) => {
    await Promise.all(
      ordered.map((g, idx) =>
        fetch("/api/weekly-goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: g.id, sort_order: idx }),
        }),
      ),
    );
  };

  const toggleCompleted = async (goal: WeeklyGoal) => {
    await fetch("/api/weekly-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id, completed: !goal.completed }),
    });
    load();
  };

  const saveEdit = async (id: string) => {
    const text = editingText.trim();
    if (!text) return;
    await fetch("/api/weekly-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, text }),
    });
    setEditingId(null);
    load();
  };

  const addGoal = async () => {
    if (!newText.trim()) return;
    await fetch("/api/weekly-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText, pillar: newPillar, week }),
    });
    setNewText("");
    setShowForm(false);
    load();
  };

  const deleteGoal = async (id: string) => {
    await fetch("/api/weekly-goals", {
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
        <h2 className="text-lg font-bold">이번 주 목표</h2>
        {goals.length > 0 && <Badge variant="secondary" className="text-xs">{completedCount}/{goals.length}</Badge>}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeek((w) => shiftWeek(w, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="text-sm font-semibold">{formatWeekLabel(week)}</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeek((w) => shiftWeek(w, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}><Plus className="h-3 w-3 mr-1" />추가</Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2">
          {showForm && (
            <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg">
              <Input placeholder="목표를 입력하세요" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} className="h-8 text-sm" />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {PILLAR_OPTIONS.map((p) => (
                    <button key={p.value} onClick={() => setNewPillar(p.value)} className={`px-2 py-1 text-xs rounded-md transition-colors ${newPillar === p.value ? `${PILLAR_COLORS[p.value]} text-white` : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <Button size="sm" className="h-7 text-xs" onClick={addGoal}>저장</Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">이번 주 목표를 설정해보세요</p>
          ) : (
            <div className="space-y-1">
              {goals.map((goal, idx) => (
                <div
                  key={goal.id}
                  draggable
                  onDragStart={() => setDraggingId(goal.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async () => {
                    if (!draggingId || draggingId === goal.id) return;
                    const updated = reorder(goals, draggingId, goal.id).map((g, i) => ({ ...g, sort_order: i }));
                    setGoals(updated);
                    setDraggingId(null);
                    await persistOrder(updated);
                    load();
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <span className="text-[11px] font-semibold text-muted-foreground w-5">#{idx + 1}</span>
                  <button onClick={() => toggleCompleted(goal)}>
                    {goal.completed ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" /> : <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {editingId === goal.id ? (
                      <Input
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => saveEdit(goal.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(goal.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onDoubleClick={() => {
                          setEditingId(goal.id);
                          setEditingText(goal.text);
                        }}
                        className={`text-sm text-left ${goal.completed ? "line-through text-muted-foreground" : ""}`}
                      >
                        {goal.text}
                      </button>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{PILLAR_LABELS[goal.pillar]}</Badge>
                  <button onClick={() => deleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
