"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, GripVertical, Pencil, Check } from "lucide-react";
import { LOCAL_DAILY_BACKUP_SYNC_EVENT } from "@/lib/local-daily-backup";
import type { DailyTodo } from "@/lib/types";

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

export function DailyTodoList({ date }: { date?: string }) {
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

  const readLocalTodos = useCallback(() => {
    const saved = localStorage.getItem(`todos_${targetDate}`);
    if (!saved) return [];
    try {
      return JSON.parse(saved) as DailyTodo[];
    } catch {
      return [];
    }
  }, [targetDate]);

  const loadTodos = useCallback(async () => {
    try {
      const response = await fetch(`/api/todos?date=${encodeURIComponent(targetDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as DailyTodo[];
      setTodos(data || []);
      setUseLocal(false);
    } catch {
      setUseLocal(true);
      setTodos(readLocalTodos());
    } finally {
      setLoading(false);
    }
  }, [readLocalTodos, targetDate]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const saveLocal = (updated: DailyTodo[]) => {
    localStorage.setItem(`todos_${targetDate}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_SYNC_EVENT));
  };

  const switchToLocal = (updated: DailyTodo[]) => {
    setUseLocal(true);
    saveLocal(updated);
  };

  const persistOrder = async (ordered: DailyTodo[]) => {
    if (useLocal) return;
    try {
      const responses = await Promise.all(
        ordered.map((t, idx) =>
          fetch("/api/todos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id, sort_order: idx }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        switchToLocal(ordered);
      }
    } catch {
      switchToLocal(ordered);
    }
  };

  const addTodo = async () => {
    const text = newText.trim();
    if (!text) return;

    if (useLocal) {
      const newTodo: DailyTodo = {
        id: `local_${Date.now()}`,
        date: targetDate,
        text,
        completed: false,
        sort_order: todos.length,
        created_at: new Date().toISOString(),
      };
      const updated = [...todos, newTodo];
      setTodos(updated);
      saveLocal(updated);
      setNewText("");
      return;
    }

    const localTodo: DailyTodo = {
      id: `local_${Date.now()}`,
      date: targetDate,
      text,
      completed: false,
      sort_order: todos.length,
      created_at: new Date().toISOString(),
    };

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: targetDate, text, sort_order: todos.length }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as DailyTodo;
      setTodos((prev) => [...prev, data]);
    } catch {
      const updated = [...todos, localTodo];
      setTodos(updated);
      switchToLocal(updated);
    } finally {
      setNewText("");
    }
  };

  const toggleTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTodos(updated);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed: !todo.completed }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      switchToLocal(updated);
    }
  };

  const deleteTodo = async (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    setTodos(updated);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    try {
      const response = await fetch(`/api/todos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await persistOrder(updated);
    } catch {
      switchToLocal(updated);
    }
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
      <CardContent className="pt-0 space-y-1">
        {todos.map((todo, idx) => (
          <div
            key={todo.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 group transition-colors ${draggingId === todo.id ? "bg-accent" : "hover:bg-accent"}`}
            draggable={editMode}
            onDragStart={() => editMode && setDraggingId(todo.id)}
            onDragOver={(e) => editMode && e.preventDefault()}
            onDrop={async () => {
              if (!editMode || !draggingId || draggingId === todo.id) return;
              const updated = reorder(todos, draggingId, todo.id).map((t, i) => ({ ...t, sort_order: i }));
              setTodos(updated);
              setDraggingId(null);
              if (useLocal) saveLocal(updated);
              else await persistOrder(updated);
            }}
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
                onClick={() => deleteTodo(todo.id)}
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
            addTodo();
          }}
          className="flex items-center gap-2 pt-2"
        >
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="할 일 추가..."
            className="h-9 text-sm lg:text-base"
          />
          <Button type="submit" size="sm" variant="ghost" className="h-9 px-2">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        {todos.length > 0 && (
          <div className="pt-3">
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
