"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SortableList, SortableRow } from "@/components/ui/sortable-list";
import { MonthlyGoal, WeeklyGoal } from "@/lib/types";
import { PILLAR_LABELS, PILLAR_COLORS } from "@/lib/constants";
import { getISOWeekString, shiftWeek, formatWeekLabel } from "@/lib/utils";
import { monthForWeek, quarterForWeek } from "@/lib/goal-links";
import { CheckCircle2, Circle, Plus, Trash2, ChevronLeft, ChevronRight, Pencil, Check, CornerDownRight } from "lucide-react";

const PILLAR_OPTIONS: { value: WeeklyGoal["pillar"]; label: string }[] = [
  { value: "career", label: "일" },
  { value: "identity", label: "나다운나" },
  { value: "assets", label: "자산" },
];

const SHORT_PILLAR: Record<WeeklyGoal["pillar"], string> = { career: "일", identity: "나다운나", assets: "자산" };

type ParentGoal = Pick<MonthlyGoal, "id" | "text" | "pillar">;

/** 상위 목표 고르기. 같은 필러 목표를 위에 둔다. */
function ParentSelect({
  label,
  value,
  options,
  pillar,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: ParentGoal[];
  pillar: WeeklyGoal["pillar"];
  onChange: (id: string | null) => void;
}) {
  const sorted = [...options].sort((a, b) => Number(b.pillar === pillar) - Number(a.pillar === pillar));
  const missing = value && !options.some((o) => o.id === value);
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-14 flex-shrink-0">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
      >
        <option value="">연결 안 함</option>
        {missing && <option value={value}>다른 기간 목표</option>}
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            [{SHORT_PILLAR[o.pillar]}] {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WeeklyGoalCard() {
  const [week, setWeek] = useState(() => getISOWeekString(new Date()));
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newPillar, setNewPillar] = useState<WeeklyGoal["pillar"]>("career");
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newMonthlyId, setNewMonthlyId] = useState<string | null>(null);
  const [newQuarterlyId, setNewQuarterlyId] = useState<string | null>(null);
  const [monthlyGoals, setMonthlyGoals] = useState<ParentGoal[]>([]);
  const [quarterlyGoals, setQuarterlyGoals] = useState<ParentGoal[]>([]);

  const month = monthForWeek(week);
  const quarter = quarterForWeek(week);

  // 이 주가 속한 달·분기의 목표만 불러와 상위 목표 후보로 쓴다.
  useEffect(() => {
    let cancelled = false;
    const fetchGoals = async (url: string): Promise<ParentGoal[]> => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        return data.goals ?? [];
      } catch {
        return [];
      }
    };
    Promise.all([
      month ? fetchGoals(`/api/monthly-goals?month=${month}`) : Promise.resolve([]),
      quarter ? fetchGoals(`/api/quarterly-goals?quarter=${quarter}`) : Promise.resolve([]),
    ]).then(([m, q]) => {
      if (cancelled) return;
      setMonthlyGoals(m);
      setQuarterlyGoals(q);
    });
    return () => {
      cancelled = true;
    };
  }, [month, quarter]);

  const monthlyById = new Map(monthlyGoals.map((g) => [g.id, g]));
  const quarterlyById = new Map(quarterlyGoals.map((g) => [g.id, g]));

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

  const updateLink = async (goal: WeeklyGoal, field: "monthly_goal_id" | "quarterly_goal_id", value: string | null) => {
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, [field]: value } : g)));
    await fetch("/api/weekly-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id, [field]: value }),
    });
    load();
  };

  const addGoal = async () => {
    if (!newText.trim()) return;
    await fetch("/api/weekly-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: newText,
        pillar: newPillar,
        week,
        monthly_goal_id: newMonthlyId,
        quarterly_goal_id: newQuarterlyId,
      }),
    });
    setNewText("");
    setNewMonthlyId(null);
    setNewQuarterlyId(null);
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
        <div className="flex items-center gap-2">
          {goals.length > 0 && <Badge variant="secondary" className="text-xs">{completedCount}/{goals.length}</Badge>}
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
        </div>
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
              <ParentSelect label="월 목표" value={newMonthlyId} options={monthlyGoals} pillar={newPillar} onChange={setNewMonthlyId} />
              <ParentSelect label="분기 목표" value={newQuarterlyId} options={quarterlyGoals} pillar={newPillar} onChange={setNewQuarterlyId} />
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">이번 주 목표를 설정해보세요</p>
          ) : (
            <div className="space-y-1">
              <SortableList
                items={goals}
                enabled={editMode}
                onReorder={async (ordered) => {
                  const updated = ordered.map((g, i) => ({ ...g, sort_order: i }));
                  setGoals(updated);
                  await persistOrder(updated);
                  load();
                }}
              >
              {goals.map((goal, idx) => (
                <SortableRow
                  key={goal.id}
                  id={goal.id}
                  enabled={editMode}
                  className="p-2 rounded-lg hover:bg-muted/50 transition-colors group bg-background"
                >
                  {(handle) => (
                  <div className="space-y-1">
                  <div className="flex items-center gap-2">
                  {handle}
                  <span className="text-[11px] font-semibold text-muted-foreground w-5">#{idx + 1}</span>
                  <button onClick={() => toggleCompleted(goal)}>
                    {goal.completed ? <CheckCircle2 className="h-5 w-5 text-identity flex-shrink-0" /> : <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {editMode ? (
                      editingId === goal.id ? (
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
                          onClick={() => {
                            setEditingId(goal.id);
                            setEditingText(goal.text);
                          }}
                          className="text-sm text-left"
                        >
                          {goal.text}
                        </button>
                      )
                    ) : (
                      <span className={`text-sm ${goal.completed ? "line-through text-muted-foreground" : ""}`}>{goal.text}</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{PILLAR_LABELS[goal.pillar]}</Badge>
                  {editMode && <button onClick={() => deleteGoal(goal.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" /></button>}
                  </div>
                  {editMode ? (
                    <div className="space-y-1 pl-7">
                      <ParentSelect label="월 목표" value={goal.monthly_goal_id} options={monthlyGoals} pillar={goal.pillar} onChange={(id) => updateLink(goal, "monthly_goal_id", id)} />
                      <ParentSelect label="분기 목표" value={goal.quarterly_goal_id} options={quarterlyGoals} pillar={goal.pillar} onChange={(id) => updateLink(goal, "quarterly_goal_id", id)} />
                    </div>
                  ) : (
                    <ParentLine
                      monthly={goal.monthly_goal_id ? monthlyById.get(goal.monthly_goal_id)?.text ?? "다른 기간 목표" : null}
                      quarterly={goal.quarterly_goal_id ? quarterlyById.get(goal.quarterly_goal_id)?.text ?? "다른 기간 목표" : null}
                    />
                  )}
                  </div>
                  )}
                </SortableRow>
              ))}
              </SortableList>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** 보기 모드에서 주간 목표 아래에 상위 목표를 한 줄로 보여 준다. */
function ParentLine({ monthly, quarterly }: { monthly: string | null; quarterly: string | null }) {
  if (!monthly && !quarterly) return null;
  return (
    <div className="flex items-start gap-1 pl-7 text-[11px] text-muted-foreground">
      <CornerDownRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <span className="min-w-0 break-words">
        {monthly && <>월: {monthly}</>}
        {monthly && quarterly && " · "}
        {quarterly && <>분기: {quarterly}</>}
      </span>
    </div>
  );
}
