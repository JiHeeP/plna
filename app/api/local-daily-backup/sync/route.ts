import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  safeDailyRecordId,
  writeDailyJournal,
  writeDailyTodo,
  writeHabitLog,
} from "@/lib/firebase/daily-record-writes";
import { recordDailyWriteAudit } from "@/lib/firebase/daily-write-audit";
import { createClient } from "@/lib/firebase/server";
import {
  hasLocalDailyBackupPayload,
  normalizeLocalDailyBackupPayload,
  type LocalBackupTodo,
} from "@/lib/local-daily-backup";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function nowIso() {
  return new Date().toISOString();
}

function stableTodoId(todo: LocalBackupTodo) {
  const source = [
    todo.date,
    todo.id ?? "",
    todo.text,
    String(todo.sort_order),
    todo.created_at ?? "",
  ].join("\0");
  return `local_todo_${todo.date}_${createHash("sha1").update(source).digest("hex").slice(0, 16)}`;
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  return [...new Map(items.map((item) => [keyFor(item), item])).values()];
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init?.headers,
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = normalizeLocalDailyBackupPayload(await request.json().catch(() => null));

    if (!hasLocalDailyBackupPayload(payload)) {
      return json({
        ok: true,
        synced: {
          journals: 0,
          todos: 0,
          habitLogs: 0,
          skippedHabitChecks: 0,
        },
      });
    }

    const timestamp = nowIso();

    const journalRows = uniqueBy(payload.journals, (journal) => journal.date).map((journal) => ({
      ...journal,
      updated_at: timestamp,
    }));

    if (journalRows.length > 0) {
      try {
        await Promise.all(journalRows.map((journal) => writeDailyJournal(journal)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordDailyWriteAudit({
          target: "local_backup_sync",
          action: "sync",
          status: "error",
          errorMessage: message,
          metadata: {
            source: "daily_journals",
            journals: journalRows.length,
            todos: payload.todos.length,
            habit_checks: payload.habitChecks.length,
          },
        });
        return json({ ok: false, source: "daily_journals", error: message }, { status: 500 });
      }
    }

    const todoRows = uniqueBy(
      payload.todos.map((todo) => {
        const id = safeDailyRecordId(todo.id) ?? stableTodoId(todo);
        return {
          id,
          date: todo.date,
          text: todo.text,
          completed: todo.completed,
          category: todo.category,
          sort_order: todo.sort_order,
          created_at: todo.created_at || timestamp,
        };
      }),
      (todo) => todo.id,
    );

    if (todoRows.length > 0) {
      try {
        await Promise.all(todoRows.map((todo) => writeDailyTodo(todo)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordDailyWriteAudit({
          target: "local_backup_sync",
          action: "sync",
          status: "error",
          errorMessage: message,
          metadata: {
            source: "daily_todos",
            journals: journalRows.length,
            todos: todoRows.length,
            habit_checks: payload.habitChecks.length,
          },
        });
        return json({ ok: false, source: "daily_todos", error: message }, { status: 500 });
      }
    }

    let habitRows: Array<{
      habit_id: string;
      date: string;
      completed: true;
      value: null;
      created_at: string;
    }> = [];

    if (payload.habitChecks.length > 0) {
      const supabase = await createClient();
      const { data: habits, error: habitsError } = await supabase
        .from("daily_habits")
        .select("*")
        .eq("is_active", true);

      if (habitsError) {
        await recordDailyWriteAudit({
          target: "local_backup_sync",
          action: "sync",
          status: "error",
          errorMessage: habitsError.message,
          metadata: {
            source: "daily_habits",
            journals: journalRows.length,
            todos: todoRows.length,
            habit_checks: payload.habitChecks.length,
          },
        });
        return json({ ok: false, source: "daily_habits", error: habitsError.message }, { status: 500 });
      }

      const habitByNameEn = new Map(
        (habits ?? []).map((habit) => [String(habit.name_en ?? ""), String(habit.id ?? "")]),
      );

      habitRows = uniqueBy(
        payload.habitChecks.flatMap((check) => {
          const habitId = habitByNameEn.get(check.habitNameEn);
          if (!habitId) return [];
          return [{
            habit_id: habitId,
            date: check.date,
            completed: true,
            value: null,
            created_at: timestamp,
          }];
        }),
        (row) => `${row.habit_id}:${row.date}`,
      );
    }

    if (habitRows.length > 0) {
      try {
        await Promise.all(habitRows.map((row) => writeHabitLog(row)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordDailyWriteAudit({
          target: "local_backup_sync",
          action: "sync",
          status: "error",
          errorMessage: message,
          metadata: {
            source: "habit_logs",
            journals: journalRows.length,
            todos: todoRows.length,
            habit_logs: habitRows.length,
            skipped_habit_checks: payload.habitChecks.length - habitRows.length,
          },
        });
        return json({ ok: false, source: "habit_logs", error: message }, { status: 500 });
      }
    }

    await recordDailyWriteAudit({
      target: "local_backup_sync",
      action: "sync",
      status: "success",
      metadata: {
        journals: journalRows.length,
        todos: todoRows.length,
        habit_logs: habitRows.length,
        skipped_habit_checks: payload.habitChecks.length - habitRows.length,
      },
    });

    return json({
      ok: true,
      synced: {
        journals: journalRows.length,
        todos: todoRows.length,
        habitLogs: habitRows.length,
        skippedHabitChecks: payload.habitChecks.length - habitRows.length,
      },
    });
  } catch (error) {
    console.error("Local daily backup sync failed:", error);
    return json(
      { ok: false, error: "Local daily backup sync failed" },
      { status: 500 },
    );
  }
}
