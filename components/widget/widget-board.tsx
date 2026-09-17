"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getDDay } from "@/lib/widget";
import { cn } from "@/lib/utils";
import {
  TODO_CATEGORIES,
  TODO_CATEGORY_ICONS,
  TODO_CATEGORY_LABELS,
  emptyByCategory,
  normalizeTodoCategory,
  type TodoCategory,
} from "@/lib/todo-category";
import type { DailyTodo, HabitWithLog } from "@/lib/types";
import { X } from "lucide-react";

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const REFRESH_MS = 5 * 60 * 1000;

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function sendJson(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/**
 * 바탕화면/폰에서 창 하나로 띄워 쓰는 위젯.
 * 읽기만 하는 이미지 위젯(/api/widget/image)과 달리 습관 체크와 할 일 입력까지 한다.
 * 메인 앱의 대시보드 카드와 같은 /api/habits, /api/todos 를 그대로 쓴다.
 */
export function WidgetBoard() {
  const [habits, setHabits] = useState<HabitWithLog[]>([]);
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<TodoCategory, string>>(() =>
    emptyByCategory(() => ""),
  );
  const [adding, setAdding] = useState(false);

  // 자정을 넘겨 창을 켜 둔 채로도 날짜가 따라가도록 새로고침마다 다시 계산한다.
  const [today, setToday] = useState(() => toDateString(new Date()));
  const dateInfo = useMemo(() => {
    const [year, month, day] = today.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return {
      label: `${month}월 ${day}일`,
      weekday: WEEKDAY_NAMES[parsed.getDay()],
      dDay: getDDay(today),
    };
  }, [today]);

  const load = useCallback(async () => {
    const date = toDateString(new Date());
    setToday(date);
    try {
      const [habitsRes, todosRes] = await Promise.all([
        fetch(`/api/habits?date=${encodeURIComponent(date)}`, { cache: "no-store" }),
        fetch(`/api/todos?date=${encodeURIComponent(date)}`, { cache: "no-store" }),
      ]);
      if (!habitsRes.ok) throw new Error(`습관 HTTP ${habitsRes.status}`);
      if (!todosRes.ok) throw new Error(`할 일 HTTP ${todosRes.status}`);

      setHabits((await habitsRes.json()) as HabitWithLog[]);
      setTodos((await todosRes.json()) as DailyTodo[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    // 창을 다시 보게 됐을 때 즉시 최신 상태로 맞춘다.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  const doneCount = habits.filter((habit) => habit.log?.completed).length;
  const percent = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;
  const openTodos = todos.filter((todo) => !todo.completed).length;

  const grouped = useMemo(() => {
    const byCategory = emptyByCategory<DailyTodo[]>(() => []);
    todos.forEach((todo) => {
      byCategory[normalizeTodoCategory(todo.category)].push(todo);
    });
    return byCategory;
  }, [todos]);

  async function toggleHabit(habit: HabitWithLog) {
    const next = !habit.log?.completed;
    // 먼저 화면을 바꾸고, 실패하면 되돌린다. 위젯은 반응이 즉각적이어야 한다.
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id
          ? { ...item, log: next ? { ...(item.log ?? {}), completed: true } as HabitWithLog["log"] : null }
          : item,
      ),
    );
    try {
      await sendJson("/api/habits", "PATCH", { habit_id: habit.id, date: today, completed: next });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      void load();
    }
  }

  async function toggleTodo(todo: DailyTodo) {
    const next = !todo.completed;
    setTodos((current) =>
      current.map((item) => (item.id === todo.id ? { ...item, completed: next } : item)),
    );
    try {
      await sendJson("/api/todos", "PATCH", { id: todo.id, date: today, completed: next });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      void load();
    }
  }

  async function addTodo(category: TodoCategory, event: React.FormEvent) {
    event.preventDefault();
    const text = drafts[category].trim();
    if (!text || adding) return;

    setAdding(true);
    try {
      await sendJson("/api/todos", "POST", {
        text,
        date: today,
        category,
        sort_order: grouped[category].length,
      });
      setDrafts((current) => ({ ...current, [category]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(false);
    }
  }

  async function removeTodo(todo: DailyTodo) {
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      const response = await fetch(
        `/api/todos?id=${encodeURIComponent(todo.id)}&date=${encodeURIComponent(today)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      void load();
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">
            {dateInfo.label} ({dateInfo.weekday})
          </h1>
          <span className="text-xs text-muted-foreground">D+{dateInfo.dDay}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">
            습관 <span className="font-bold text-foreground">{doneCount}/{habits.length}</span>
          </span>
          <span className="font-bold text-blue-600">{percent}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">
          저장하지 못했습니다: {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">습관</h2>
            <ul className="space-y-1">
              {habits.map((habit) => {
                const checked = Boolean(habit.log?.completed);
                return (
                  <li key={habit.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent">
                      <Checkbox checked={checked} onCheckedChange={() => void toggleHabit(habit)} />
                      <span className={cn("text-sm", checked && "text-muted-foreground line-through")}>
                        {habit.name}
                      </span>
                    </label>
                  </li>
                );
              })}
              {habits.length === 0 ? (
                <li className="px-1 py-1.5 text-sm text-muted-foreground">등록된 습관이 없습니다.</li>
              ) : null}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
              할 일 {openTodos > 0 ? `· 남은 ${openTodos}개` : null}
            </h2>
            <div className="space-y-3">
              {TODO_CATEGORIES.map((category) => {
                const sectionTodos = grouped[category];
                const sectionDone = sectionTodos.filter((todo) => todo.completed).length;
                return (
                  <div key={category}>
                    <div className="mb-1 flex items-baseline justify-between px-1">
                      <span className="text-xs font-semibold">
                        {TODO_CATEGORY_ICONS[category]} {TODO_CATEGORY_LABELS[category]}
                      </span>
                      {sectionTodos.length > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          {sectionDone}/{sectionTodos.length}
                        </span>
                      ) : null}
                    </div>
                    <ul className="space-y-1">
                      {sectionTodos.map((todo) => (
                        <li key={todo.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent">
                          <Checkbox
                            checked={todo.completed}
                            onCheckedChange={() => void toggleTodo(todo)}
                          />
                          <span
                            className={cn(
                              "flex-1 text-sm",
                              todo.completed && "text-muted-foreground line-through",
                            )}
                          >
                            {todo.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeTodo(todo)}
                            aria-label={`${todo.text} 삭제`}
                            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form onSubmit={(event) => void addTodo(category, event)} className="mt-1">
                      <Input
                        value={drafts[category]}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [category]: event.target.value }))
                        }
                        placeholder={`${TODO_CATEGORY_LABELS[category]} 할 일을 적고 Enter`}
                        disabled={adding}
                        className="h-8 text-sm"
                      />
                    </form>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
