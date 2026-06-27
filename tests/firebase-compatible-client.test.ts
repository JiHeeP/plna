import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryFirestoreStore,
  createSupabaseCompatClient,
} from "../lib/firebase/supabase-compatible";

describe("Supabase-compatible Firebase client", () => {
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
});
