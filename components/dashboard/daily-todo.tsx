"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

  const loadTodos = useCallback(async () => {
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("daily_todos")
        .select("*")
        .eq("date", targetDate)
        .order("sort_order")
        .order("created_at");

      if (error) throw error;

      setTodos(data || []);
      setUseLocal(false);
    } catch {
      setUseLocal(true);
      const saved = localStorage.getItem(`todos_${targetDate}`);
      if (saved) setTodos(JSON.parse(saved));
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const saveLocal = (updated: DailyTodo[]) => {
    localStorage.setItem(`todos_${targetDate}`, JSON.stringify(updated));
  };

  const persistOrder = async (ordered: DailyTodo[]) => {
    if (useLocal) return;
    const supabase = createClient();
    await Promise.all(
      ordered.map((t, idx) =>
        supabase.from("daily_todos").update({ sort_order: idx }).eq("id", t.id),
      ),
    );
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

    const supabase = createClient();
    const { data, error } = await supabase
      .from("daily_todos")
      .insert({ date: targetDate, text, sort_order: todos.length })
      .select()
      .single();

    if (error) return;
    setTodos((prev) => [...prev, data]);
    setNewText("");
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

    const supabase = createClient();
    await supabase.from("daily_todos").update({ completed: !todo.completed }).eq("id", id);
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

    const supabase = createClient();
    await supabase.from("daily_todos").update({ text }).eq("id", id);
  };

  const deleteTodo = async (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    setTodos(updated);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    const supabase = createClient();
    await supabase.from("daily_todos").delete().eq("id", id);
    await persistOrder(updated);
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
          <CardTitle className="text-base">오늘의 할 일</CardTitle>
          {todos.length > 0 && (
            <span className="text-sm text-muted-foreground">{completedCount}/{todos.length} 완료</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {todos.map((todo, idx) => (
          <div
            key={todo.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 group transition-colors ${draggingId === todo.id ? "bg-accent" : "hover:bg-accent"}`}
            draggable
            onDragStart={() => setDraggingId(todo.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async () => {
              if (!draggingId || draggingId === todo.id) return;
              const updated = reorder(todos, draggingId, todo.id).map((t, i) => ({ ...t, sort_order: i }));
              setTodos(updated);
              setDraggingId(null);
              if (useLocal) saveLocal(updated);
              else await persistOrder(updated);
            }}
            onDragEnd={() => setDraggingId(null)}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <span className="text-[11px] font-semibold text-muted-foreground w-6">#{idx + 1}</span>
            <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} />

            {editingId === todo.id ? (
              <Input
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => saveEdit(todo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(todo.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => startEdit(todo)}
                className={`flex-1 text-left text-sm ${todo.completed ? "line-through text-muted-foreground" : ""}`}
              >
                {todo.text}
              </button>
            )}

            <button
              type="button"
              onClick={() => deleteTodo(todo.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
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
            className="h-9 text-sm"
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
