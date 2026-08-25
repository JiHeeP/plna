"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, GripVertical, Pencil, Check } from "lucide-react";
import {
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
  LOCAL_DAILY_BACKUP_SYNC_EVENT,
} from "@/lib/local-daily-backup";
import {
  TODO_CATEGORIES,
  TODO_CATEGORY_LABELS,
  normalizeTodoCategory,
  type TodoCategory,
} from "@/lib/todo-category";
import type { DailyTodo } from "@/lib/types";

const CATEGORY_ICONS: Record<TodoCategory, string> = {
  school: "🏫",
  personal: "🏠",
};

const REFRESH_MS = 5 * 60 * 1000;

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function reorder<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const from = items.findIndex((x) => x.id === activeId);
  const to = items.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0 || from === to) return items;
  const cloned = [...items];
  const [moved] = cloned.splice(from, 1);
  cloned.splice(to, 0, moved);
  return cloned;
}

function normalizeTodos(items: DailyTodo[]) {
  return items.map((todo) => ({ ...todo, category: normalizeTodoCategory(todo.category) }));
}

export function DailyTodoList({ date }: { date?: string }) {
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [newTexts, setNewTexts] = useState<Record<TodoCategory, string>>({
    school: "",
    personal: "",
  });
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

  const readLocalTodos = useCallback(() => {
    const saved = localStorage.getItem(`todos_${targetDate}`);
    if (saved === null) return null;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? normalizeTodos(parsed as DailyTodo[]) : null;
    } catch {
      return null;
    }
  }, [targetDate]);

  const saveLocal = useCallback(
    (updated: DailyTodo[], notify = true) => {
      localStorage.setItem(`todos_${targetDate}`, JSON.stringify(updated));
      if (notify) {
        window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_CHANGED_EVENT));
      }
    },
    [targetDate],
  );

  const loadTodos = useCallback(async () => {
    try {
      const response = await fetch(`/api/todos?date=${encodeURIComponent(targetDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // 서버가 진실의 원천: 위젯 등 다른 창에서 바꾼 내용을 그대로 따라간다.
      // localStorage 사본은 오프라인 폴백과 백업 sync용으로만 유지한다.
      const data = normalizeTodos((await response.json()) as DailyTodo[]);
      setTodos(data);
      saveLocal(data, false);
      setUseLocal(false);
    } catch {
      setUseLocal(true);
      setTodos(readLocalTodos() ?? []);
    } finally {
      setLoading(false);
    }
  }, [readLocalTodos, saveLocal, targetDate]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 위젯 창에서 추가/체크한 할 일이 메인 화면에도 따라오도록
  // 주기적으로, 창이 다시 보일 때, 로컬 백업 sync 직후에 다시 읽는다.
  // 수정 모드이거나 입력 중일 때는 새로고침으로 작업이 날아가지 않게 쉰다.
  const busy =
    editMode ||
    editingId !== null ||
    newTexts.school.trim() !== "" ||
    newTexts.personal.trim() !== "";

  useEffect(() => {
    if (busy) return;

    const timer = setInterval(() => loadTodos(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadTodos();
    };
    const onSynced = () => loadTodos();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, onSynced);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, onSynced);
    };
  }, [busy, loadTodos]);

  const grouped = useMemo(() => {
    const byCategory: Record<TodoCategory, DailyTodo[]> = { school: [], personal: [] };
    todos.forEach((todo) => {
      byCategory[normalizeTodoCategory(todo.category)].push(todo);
    });
    return byCategory;
  }, [todos]);

  const switchToLocal = (updated: DailyTodo[]) => {
    setUseLocal(true);
    saveLocal(updated);
  };

  const persistOrder = async (all: DailyTodo[], reordered: DailyTodo[]) => {
    if (useLocal) return;
    saveLocal(all, false);
    try {
      const responses = await Promise.all(
        reordered.map((t) =>
          fetch("/api/todos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id, date: targetDate, sort_order: t.sort_order }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        switchToLocal(all);
      } else {
        saveLocal(all);
      }
    } catch {
      switchToLocal(all);
    }
  };

  const addTodo = async (category: TodoCategory) => {
    const text = newTexts[category].trim();
    if (!text) return;

    const sortOrder = grouped[category].length;
    const localTodo: DailyTodo = {
      id: `local_${Date.now()}`,
      date: targetDate,
      text,
      completed: false,
      category,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    };
    const updated = [...todos, localTodo];
    setTodos(updated);
    setNewTexts((prev) => ({ ...prev, [category]: "" }));

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    saveLocal(updated, false);

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: localTodo.id,
          date: targetDate,
          text,
          category,
          sort_order: sortOrder,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = normalizeTodos([(await response.json()) as DailyTodo])[0];
      const saved = updated.map((todo) => (todo.id === localTodo.id ? data : todo));
      setTodos(saved);
      saveLocal(saved);
    } catch {
      switchToLocal(updated);
    }
  };

  const toggleTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTodos(updated);
    saveLocal(updated, false);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, date: targetDate, completed: !todo.completed }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      saveLocal(updated);
    } catch {
      switchToLocal(updated);
    }
  };

  const startEdit = (todo: DailyTodo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  };

  const saveEdit = async (id: string) => {
    const text = editingText.trim();
    if (!text) return;

    const updated = todos.map((t) => (t.id === id ? { ...t, text } : t));
    setTodos(updated);
    setEditingId(null);
    saveLocal(updated, false);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, date: targetDate, text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      saveLocal(updated);
    } catch {
      switchToLocal(updated);
    }
  };

  const deleteTodo = async (todo: DailyTodo) => {
    const category = normalizeTodoCategory(todo.category);
    const remainingInCategory = grouped[category]
      .filter((t) => t.id !== todo.id)
      .map((t, i) => ({ ...t, sort_order: i }));
    const updated = todos
      .filter((t) => t.id !== todo.id)
      .map((t) => remainingInCategory.find((r) => r.id === t.id) ?? t);
    setTodos(updated);
    saveLocal(updated, false);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch(`/api/todos?id=${encodeURIComponent(todo.id)}&date=${encodeURIComponent(targetDate)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await persistOrder(updated, remainingInCategory);
    } catch {
      switchToLocal(updated);
    }
  };

  const dropOnTodo = async (target: DailyTodo) => {
    if (!editMode || !draggingId || draggingId === target.id) return;
    const dragging = todos.find((t) => t.id === draggingId);
    setDraggingId(null);
    if (!dragging) return;

    const category = normalizeTodoCategory(target.category);
    if (normalizeTodoCategory(dragging.category) !== category) return;

    const reordered = reorder(grouped[category], dragging.id, target.id).map((t, i) => ({
      ...t,
      sort_order: i,
    }));
    const updated = todos.map((t) => reordered.find((r) => r.id === t.id) ?? t);
    setTodos(updated);
    if (useLocal) saveLocal(updated);
    else await persistOrder(updated, reordered);
  };

  const completedCount = todos.filter((t) => t.completed).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderSection = (category: TodoCategory) => {
    const sectionTodos = grouped[category];
    const sectionCompleted = sectionTodos.filter((t) => t.completed).length;

    return (
      <div key={category} className="space-y-1">
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm lg:text-base font-semibold">
            {CATEGORY_ICONS[category]} {TODO_CATEGORY_LABELS[category]}
          </span>
          {sectionTodos.length > 0 && (
            <span className="text-xs lg:text-sm text-muted-foreground">
              {sectionCompleted}/{sectionTodos.length} 완료
            </span>
          )}
        </div>

        {sectionTodos.map((todo, idx) => (
          <div
            key={todo.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 group transition-colors ${draggingId === todo.id ? "bg-accent" : "hover:bg-accent"}`}
            draggable={editMode}
            onDragStart={() => editMode && setDraggingId(todo.id)}
            onDragOver={(e) => editMode && e.preventDefault()}
            onDrop={() => dropOnTodo(todo)}
            onDragEnd={() => setDraggingId(null)}
          >
            {editMode ? (
              <>
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <span className="text-[11px] lg:text-xs font-semibold text-muted-foreground w-6">#{idx + 1}</span>
              </>
            ) : (
              <span className="text-[11px] lg:text-xs font-semibold text-muted-foreground w-6">#{idx + 1}</span>
            )}
            <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} />

            {editMode ? (
              editingId === todo.id ? (
                <Input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={() => saveEdit(todo.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(todo.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-8 text-sm lg:text-base"
                  autoFocus
                />
              ) : (
                <button type="button" onClick={() => startEdit(todo)} className="flex-1 text-left text-sm lg:text-base">
                  {todo.text}
                </button>
              )
            ) : (
              <span className={`flex-1 text-left text-sm lg:text-base ${todo.completed ? "line-through text-muted-foreground" : ""}`}>
                {todo.text}
              </span>
            )}

            {editMode && (
              <button
                type="button"
                onClick={() => deleteTodo(todo)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTodo(category);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={newTexts[category]}
            onChange={(e) => setNewTexts((prev) => ({ ...prev, [category]: e.target.value }))}
            placeholder={`${TODO_CATEGORY_LABELS[category]} 할 일 추가...`}
            className="h-9 text-sm lg:text-base"
          />
          <Button type="submit" size="sm" variant="ghost" className="h-9 px-2">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base lg:text-lg">오늘의 할 일</CardTitle>
          <div className="flex items-center gap-2">
            {todos.length > 0 && (
              <span className="text-sm lg:text-base text-muted-foreground">{completedCount}/{todos.length} 완료</span>
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {TODO_CATEGORIES.map((category) => renderSection(category))}

        {todos.length > 0 && (
          <div className="pt-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.round((completedCount / todos.length) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
