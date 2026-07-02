import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createAdminFirestoreStore } from "../lib/firebase/firestore-store";
import {
  createMemoryFirestoreStore,
  createSupabaseCompatClient,
} from "../lib/firebase/supabase-compatible";
import { getWeekDatesFromStr, toDateString } from "../lib/utils";

type FakeAdminDocRef = {
  id: string;
  set: (data: Record<string, unknown>, options?: { merge: boolean }) => Promise<unknown>;
  delete: () => Promise<unknown>;
};

type FakeAdminCollection = {
  get: () => Promise<{
    docs: Array<{
      id: string;
      data: () => Record<string, unknown>;
    }>;
  }>;
  doc: (id?: string) => FakeAdminDocRef;
};

function createFakeAdminDb() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const docCalls: Array<{ collectionName: string; id?: string }> = [];

  function rowsFor(collectionName: string) {
    if (!collections.has(collectionName)) collections.set(collectionName, new Map());
    return collections.get(collectionName)!;
  }

  const db = {
    collection(collectionName: string): FakeAdminCollection {
      const rows = rowsFor(collectionName);

      return {
        async get() {
          return {
            docs: Array.from(rows.entries()).map(([id, row]) => ({
              id,
              data: () => ({ ...row }),
            })),
          };
        },
        doc(id?: string) {
          docCalls.push({ collectionName, id });
          const docId = id ?? `${collectionName}_auto_${docCalls.length}`;

          return {
            id: docId,
            async set(data: Record<string, unknown>, options?: { merge: boolean }) {
              rows.set(docId, options?.merge ? { ...rows.get(docId), ...data } : { ...data });
            },
            async delete() {
              rows.delete(docId);
            },
          };
        },
      };
    },
  };

  return { db, docCalls };
}

describe("Supabase-compatible Firebase client", () => {
  it("admin Firestore store creates no-id rows with Firestore auto IDs", async () => {
    const { db, docCalls } = createFakeAdminDb();
    const store = createAdminFirestoreStore(db);

    const created = await store.create("daily_journals", {
      date: "2026-06-29",
      accomplishments: "Wrote the weekly review",
      went_well: "Kept the daily check",
      to_improve: "Start earlier tomorrow",
    });

    assert.equal(created.id, "daily_journals_auto_1");
    assert.deepEqual(docCalls, [{ collectionName: "daily_journals", id: undefined }]);

    const [stored] = await store.list("daily_journals");
    assert.equal(stored.id, created.id);
    assert.equal(stored.date, "2026-06-29");
  });

  it("normalizes Firestore timestamp dates before dashboard range filters", async () => {
    const { db } = createFakeAdminDb();
    const store = createAdminFirestoreStore(db);
    await db.collection("daily_journals").doc("journal-1").set({
      date: { toDate: () => new Date("2026-06-29T00:00:00.000Z") },
      created_at: { toDate: () => new Date("2026-06-29T12:30:00.000Z") },
      accomplishments: "Timestamp date is visible",
      went_well: "",
      to_improve: "",
    });

    const client = createSupabaseCompatClient(store);
    const result = await client
      .from("daily_journals")
      .select("*")
      .gte("date", "2026-06-29")
      .lte("date", "2026-06-29");

    assert.equal(result.error, null);
    assert.equal(result.data?.length, 1);
    assert.equal(result.data?.[0].date, "2026-06-29");
    assert.equal(result.data?.[0].created_at, "2026-06-29T12:30:00.000Z");
  });

  it("filters, orders, and returns exact head counts", async () => {
    const client = createSupabaseCompatClient(
      createMemoryFirestoreStore({
        weekly_goals: [
          { id: "a", week: "2026-W01", sort_order: 2, created_at: "2026-01-02T00:00:00.000Z" },
          { id: "b", week: "2026-W01", sort_order: 1, created_at: "2026-01-01T00:00:00.000Z" },
          { id: "c", week: "2026-W02", sort_order: 1, created_at: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    );

    const countResult = await client
      .from("weekly_goals")
      .select("id", { count: "exact", head: true })
      .eq("week", "2026-W01");

    assert.equal(countResult.error, null);
    assert.equal(countResult.count, 2);
    assert.equal(countResult.data, null);

    const orderedResult = await client
      .from("weekly_goals")
      .select("*")
      .eq("week", "2026-W01")
      .order("sort_order")
      .order("created_at", { ascending: true });

    assert.deepEqual(orderedResult.data?.map((item) => item.id), ["b", "a"]);
  });

  it("inserts defaults and returns a selected single row", async () => {
    const store = createMemoryFirestoreStore();
    const client = createSupabaseCompatClient(store);

    const result = await client
      .from("daily_todos")
      .insert({ date: "2026-01-01", text: "Write migration", sort_order: 0 })
      .select()
      .single();

    assert.equal(result.error, null);
    assert.equal(result.data?.date, "2026-01-01");
    assert.equal(result.data?.text, "Write migration");
    assert.equal(result.data?.completed, false);
    assert.match(result.data?.id ?? "", /^daily_todos_/);
    assert.match(result.data?.created_at ?? "", /^\d{4}-\d{2}-\d{2}T/);

    const stored = await store.list("daily_todos");
    assert.equal(stored.length, 1);
  });

  it("preserves explicit ids when inserting local-first daily todos", async () => {
    const store = createMemoryFirestoreStore();
    const client = createSupabaseCompatClient(store);

    const result = await client
      .from("daily_todos")
      .insert({
        id: "local_123",
        date: "2026-07-02",
        text: "Local-first todo",
        sort_order: 0,
      })
      .select()
      .single();

    assert.equal(result.error, null);
    assert.equal(result.data?.id, "local_123");

    const stored = await store.list("daily_todos");
    assert.equal(stored[0].id, "local_123");
  });

  it("upserts by onConflict fields instead of creating duplicates", async () => {
    const store = createMemoryFirestoreStore({
      habit_logs: [
        {
          id: "log-1",
          habit_id: "habit-1",
          date: "2026-01-01",
          completed: false,
          value: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const client = createSupabaseCompatClient(store);

    const result = await client
      .from("habit_logs")
      .upsert(
        { habit_id: "habit-1", date: "2026-01-01", completed: true },
        { onConflict: "habit_id,date" },
      )
      .select()
      .single();

    assert.equal(result.error, null);
    assert.equal(result.data?.id, "log-1");
    assert.equal(result.data?.completed, true);
    assert.equal((await store.list("habit_logs")).length, 1);
  });

  it("matches Supabase single-row missing errors", async () => {
    const client = createSupabaseCompatClient(createMemoryFirestoreStore());

    const result = await client
      .from("daily_journals")
      .select("*")
      .eq("date", "2026-01-01")
      .single();

    assert.equal(result.data, null);
    assert.equal(result.error?.code, "PGRST116");
  });

  it("supports the ilike OR search used by conversation lookup", async () => {
    const client = createSupabaseCompatClient(
      createMemoryFirestoreStore({
        conversations: [
          { id: "one", partner: "Ji", summary: "Firebase migration", went_well: "", to_improve: "" },
          { id: "two", partner: "Kim", summary: "Supabase cleanup", went_well: "", to_improve: "" },
          { id: "three", partner: "Lee", summary: "Unrelated", went_well: "", to_improve: "" },
        ],
      }),
    );

    const result = await client
      .from("conversations")
      .select("*")
      .or("partner.ilike.%kim%,summary.ilike.%firebase%,went_well.ilike.%firebase%");

    assert.deepEqual(result.data?.map((item) => item.id), ["one", "two"]);
  });

  it("supports the in filter used by pillar progress", async () => {
    const client = createSupabaseCompatClient(
      createMemoryFirestoreStore({
        milestones: [
          { id: "career", pillar: "career" },
          { id: "identity", pillar: "identity" },
          { id: "assets", pillar: "assets" },
        ],
      }),
    );

    const result = await client
      .from("milestones")
      .select("pillar")
      .in("pillar", ["career", "assets"]);

    assert.deepEqual(result.data?.map((item) => item.id), ["career", "assets"]);
  });

  it("promotes backlog items to todos through the existing RPC name", async () => {
    const store = createMemoryFirestoreStore({
      ops_backlog_items: [
        {
          id: "backlog-1",
          date: "2026-01-01",
          text: "Prepare slides",
          source: "night-log",
          status: "pending",
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      daily_todos: [
        {
          id: "todo-1",
          date: "2026-01-02",
          text: "Existing todo",
          completed: false,
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const client = createSupabaseCompatClient(store);

    const result = await client.rpc("promote_backlog_item_to_todo", {
      p_backlog_id: "backlog-1",
      p_target_date: "2026-01-02",
    });

    assert.equal(result.error, null);
    assert.equal(result.data?.[0].backlog_id, "backlog-1");
    assert.equal(result.data?.[0].todo_text, "Prepare slides");
    assert.equal(result.data?.[0].sort_order, 1);

    const [backlog] = await store.list("ops_backlog_items");
    assert.equal(backlog.status, "promoted");
    assert.equal((await store.list("daily_todos")).length, 2);
  });

  it("reads daily check todos, habit logs, and journals through the weekly dashboard query shape", async () => {
    const client = createSupabaseCompatClient(createMemoryFirestoreStore());

    const todoResult = await client
      .from("daily_todos")
      .insert([
        {
          id: "todo-1",
          date: "2026-06-29",
          text: "Plan the week",
          completed: true,
          sort_order: 1,
        },
        {
          id: "todo-2",
          date: "2026-06-29",
          text: "Write the daily check",
          completed: false,
          sort_order: 2,
        },
      ])
      .select();

    assert.equal(todoResult.error, null);

    const habitResult = await client
      .from("daily_habits")
      .insert({
        id: "habit-1",
        name: "Read",
        name_en: "reading",
        category: "identity",
        sort_order: 1,
        is_active: true,
      })
      .select()
      .single();

    assert.equal(habitResult.error, null);

    const logResult = await client
      .from("habit_logs")
      .upsert(
        {
          habit_id: "habit-1",
          date: "2026-06-29",
          completed: true,
        },
        { onConflict: "habit_id,date" },
      )
      .select()
      .single();

    assert.equal(logResult.error, null);

    const journalResult = await client
      .from("daily_journals")
      .upsert(
        {
          date: "2026-06-29",
          accomplishments: "Finished the daily review",
          went_well: "Stayed focused",
          to_improve: "Leave more margin",
        },
        { onConflict: "date" },
      )
      .select()
      .single();

    assert.equal(journalResult.error, null);

    const week = "2026-W27";
    const dates = getWeekDatesFromStr(week);
    const startDate = toDateString(dates[0]);
    const endDate = toDateString(dates[6]);

    const [habitsRes, logsRes, journalsRes] = await Promise.all([
      client.from("daily_habits").select("*").eq("is_active", true).order("sort_order"),
      client.from("habit_logs").select("*").gte("date", startDate).lte("date", endDate).eq("completed", true),
      client.from("daily_journals").select("*").gte("date", startDate).lte("date", endDate),
    ]);
    const todosRes = await client
      .from("daily_todos")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date")
      .order("sort_order")
      .order("created_at");

    assert.equal(habitsRes.error, null);
    assert.equal(logsRes.error, null);
    assert.equal(journalsRes.error, null);
    assert.equal(todosRes.error, null);

    const habits = habitsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const journals = journalsRes.data ?? [];
    const todos = todosRes.data ?? [];
    const totalHabitsPerDay = habits.length;
    const dailyData = dates.map((date) => {
      const dateStr = toDateString(date);
      const dayLogs = logs.filter((log) => log.date === dateStr);
      const journal = journals.find((entry) => entry.date === dateStr);
      const dayTodos = todos.filter((todo) => todo.date === dateStr);

      return {
        date: dateStr,
        habitRate: totalHabitsPerDay > 0
          ? Math.round((dayLogs.length / totalHabitsPerDay) * 100)
          : 0,
        habitCompleted: dayLogs.length,
        habitTotal: totalHabitsPerDay,
        todoCompleted: dayTodos.filter((todo) => todo.completed).length,
        todoTotal: dayTodos.length,
        todos: dayTodos.map((todo) => ({
          id: todo.id,
          text: todo.text,
          completed: Boolean(todo.completed),
        })),
        accomplishments: journal?.accomplishments ?? "",
        went_well: journal?.went_well ?? "",
        to_improve: journal?.to_improve ?? "",
      };
    });

    assert.deepEqual(dailyData[0], {
      date: "2026-06-29",
      habitRate: 100,
      habitCompleted: 1,
      habitTotal: 1,
      todoCompleted: 1,
      todoTotal: 2,
      todos: [
        { id: "todo-1", text: "Plan the week", completed: true },
        { id: "todo-2", text: "Write the daily check", completed: false },
      ],
      accomplishments: "Finished the daily review",
      went_well: "Stayed focused",
      to_improve: "Leave more margin",
    });
  });
});
