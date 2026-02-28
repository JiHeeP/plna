"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DailyTodo } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyTodoList({ date }: { date?: string }) {
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);

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
      if (saved) {
        setTodos(JSON.parse(saved));
      }
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

    const updated = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    setTodos(updated);

    if (useLocal) {
      saveLocal(updated);
      return;
    }

    const supabase = createClient();
    await supabase
      .from("daily_todos")
      .update({ completed: !todo.completed })
      .eq("id", id);
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
            <span className="text-sm text-muted-foreground">
              {completedCount}/{todos.length} 완료
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {/* 할 일 목록 */}
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 group hover:bg-accent transition-colors"
          >
            <Checkbox
              checked={todo.completed}
              onCheckedChange={() => toggleTodo(todo.id)}
            />
            <span
              className={`flex-1 text-sm ${
                todo.completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {todo.text}
            </span>
            <button
              type="button"
              onClick={() => deleteTodo(todo.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* 새 할 일 입력 */}
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

        {/* 진행률 바 */}
        {todos.length > 0 && (
          <div className="pt-3">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${Math.round((completedCount / todos.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
