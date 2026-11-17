import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGoalUpdate, verifyGoalLinks } from "../lib/goal-links";
import { createMemoryFirestoreStore, createSupabaseCompatClient } from "../lib/firebase/supabase-compatible";

describe("parseGoalUpdate", () => {
  it("keeps only allowed fields", () => {
    assert.deepEqual(
      parseGoalUpdate({ id: "g1", text: " 새 문구 ", week: "2026-W01", created_at: "x", sort_order: 2 }),
      { ok: true, value: { id: "g1", updates: { text: "새 문구", sort_order: 2 } } },
    );
  });

  it("ignores link fields unless allowed", () => {
    assert.equal(parseGoalUpdate({ id: "g1", monthly_goal_id: "m1" }).ok, false);
    assert.deepEqual(parseGoalUpdate({ id: "g1", monthly_goal_id: "m1" }, { allowLinks: true }), {
      ok: true,
      value: { id: "g1", updates: { monthly_goal_id: "m1" } },
    });
  });

  it("rejects bad values", () => {
    assert.equal(parseGoalUpdate({ text: "a" }).ok, false);
    assert.equal(parseGoalUpdate({ id: "g1", completed: "yes" }).ok, false);
    assert.equal(parseGoalUpdate({ id: "g1", pillar: "general" }).ok, false);
    assert.equal(parseGoalUpdate({ id: "g1", text: "  " }).ok, false);
    assert.equal(parseGoalUpdate({ id: "g1", sort_order: "x" }).ok, false);
  });
});

describe("verifyGoalLinks", () => {
  const client = createSupabaseCompatClient(
    createMemoryFirestoreStore({
      monthly_goals: [{ id: "m1", month: "2026-11", text: "월 목표" }],
      quarterly_goals: [{ id: "q1", quarter: "2026-Q4", text: "분기 목표" }],
    }),
  );

  it("passes for existing goals, null and unrelated fields", async () => {
    assert.equal(await verifyGoalLinks(client, { monthly_goal_id: "m1", quarterly_goal_id: "q1" }), null);
    assert.equal(await verifyGoalLinks(client, { monthly_goal_id: null }), null);
    assert.equal(await verifyGoalLinks(client, { text: "x" } as never), null);
  });

  it("fails for a missing goal", async () => {
    assert.match(String(await verifyGoalLinks(client, { monthly_goal_id: "nope" })), /찾을 수 없습니다/);
    assert.match(String(await verifyGoalLinks(client, { quarterly_goal_id: "m1" })), /찾을 수 없습니다/);
  });
});

describe("compat writes", () => {
  it("update writes only the changed fields (no stale overwrite)", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const store = createMemoryFirestoreStore({ daily_todos: [{ id: "t1", date: "2026-11-17", text: "a", completed: false }] });
    const original = store.update.bind(store);
    store.update = async (collectionName, id, data) => {
      writes.push(data);
      return original(collectionName, id, data);
    };
    const client = createSupabaseCompatClient(store);
    const { data } = await client.from("daily_todos").update({ completed: true }).eq("id", "t1").select();
    assert.deepEqual(writes, [{ completed: true }]);
    assert.equal(data?.[0].text, "a");
    assert.equal(data?.[0].completed, true);
    const [row] = await store.list("daily_todos");
    assert.deepEqual(row, { id: "t1", date: "2026-11-17", text: "a", completed: true });
  });

  it("updateMany changes all rows or none", async () => {
    const store = createMemoryFirestoreStore({
      daily_habits: [
        { id: "h1", sort_order: 1 },
        { id: "h2", sort_order: 2 },
      ],
    });
    const client = createSupabaseCompatClient(store);
    assert.equal(
      (await client.updateMany("daily_habits", [
        { id: "h1", data: { sort_order: 2 } },
        { id: "h2", data: { sort_order: 1 } },
      ])).error,
      null,
    );
    assert.deepEqual((await store.list("daily_habits")).map((row) => row.sort_order), [2, 1]);

    const failed = await client.updateMany("daily_habits", [
      { id: "h1", data: { sort_order: 9 } },
      { id: "missing", data: { sort_order: 9 } },
    ]);
    assert.ok(failed.error);
    assert.deepEqual((await store.list("daily_habits")).map((row) => row.sort_order), [2, 1]);
  });
});
