import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  createDailyTodoIfMissing,
  createHabitLogIfMissing,
  safeDailyRecordId,
  writeDailyJournal,
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

    // 백업은 "없어진 항목 복원"만 한다. 이미 서버에 있는 할 일을 덮어쓰면
    // 위젯에서 체크한 상태나 오늘로 이월된 날짜가 낡은 스냅샷으로 되돌아간다.
    let createdTodoCount = 0;
    if (todoRows.length > 0) {
      try {
        const results = await Promise.all(todoRows.map((todo) => createDailyTodoIfMissing(todo)));
        createdTodoCount = results.filter((result) => result.created).length;
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

    // 할 일과 같은 원칙: 이미 로그가 있는 습관·날짜는 건드리지 않는다.
    // 위젯에서 체크를 해제한 습관이 낡은 스냅샷 때문에 다시 체크되는 것을 막는다.
    let createdHabitLogCount = 0;
    if (habitRows.length > 0) {
      try {
        const results = await Promise.all(habitRows.map((row) => createHabitLogIfMissing(row)));
        createdHabitLogCount = results.filter((result) => result.created).length;
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
        todos: createdTodoCount,
        skipped_existing_todos: todoRows.length - createdTodoCount,
        habit_logs: createdHabitLogCount,
        skipped_existing_habit_logs: habitRows.length - createdHabitLogCount,
        skipped_habit_checks: payload.habitChecks.length - habitRows.length,
      },
    });

    return json({
      ok: true,
      synced: {
        journals: journalRows.length,
        todos: createdTodoCount,
        skippedExistingTodos: todoRows.length - createdTodoCount,
        habitLogs: createdHabitLogCount,
        skippedExistingHabitLogs: habitRows.length - createdHabitLogCount,
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
