import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dailyDiaryDocId,
  dailyJournalDocId,
  habitLogDocId,
  patchDailyTodo,
  rolloverIncompleteTodos,
  writeDailyDiary,
  writeDailyJournal,
  writeDailyTodo,
  writeHabitLog,
} from "../lib/firebase/daily-record-writes";

function createWriteOnlyDb() {
  const writes: Array<{
    collectionName: string;
    id: string;
    data?: Record<string, unknown>;
    options?: { merge: boolean };
    deleted?: boolean;
  }> = [];

  return {
    writes,
    db: {
      collection(collectionName: string) {
        return {
          get() {
            throw new Error("read should not be called");
          },
          doc(id: string) {
            return {
              id,
              async set(data: Record<string, unknown>, options?: { merge: boolean }) {
                writes.push({ collectionName, id, data, options });
              },
              async delete() {
                writes.push({ collectionName, id, deleted: true });
              },
            };
          },
        };
      },
    },
  };
}

function createQueryDb(rows: Array<Record<string, unknown>>) {
  const writes: Array<{ id: string; data: Record<string, unknown>; options?: { merge: boolean } }> = [];

  function makeQuery(filters: Array<(row: Record<string, unknown>) => boolean>) {
    return {
      where(field: string, op: string, value: string) {
        const filter = (row: Record<string, unknown>) => {
          const actual = String(row[field] ?? "");
          if (op === ">=") return actual >= value;
          if (op === "<") return actual < value;
          if (op === "==") return actual === value;
          throw new Error(`unsupported op: ${op}`);
        };
        return makeQuery([...filters, filter]);
      },
      async get() {
        const docs = rows
          .filter((row) => filters.every((filter) => filter(row)))
          .map((row) => ({
            id: String(row.id),
            data: () => row,
            ref: {
              async set(data: Record<string, unknown>, options?: { merge: boolean }) {
                writes.push({ id: String(row.id), data, options });
              },
            },
          }));
        return { docs };
      },
    };
  }

  return {
    writes,
    db: {
      collection() {
        return makeQuery([]);
      },
    },
  };
}

describe("daily record direct Firestore writes", () => {
  it("writes journals to deterministic date documents without reading", async () => {
    const { db, writes } = createWriteOnlyDb();

    const row = await writeDailyJournal({
      date: "2026-07-02",
      accomplishments: "Saved",
      updated_at: "2026-07-02T12:00:00.000Z",
    }, db);

    assert.equal(row.id, "daily_journals_2026-07-02");
    assert.deepEqual(writes, [{
      collectionName: "daily_journals",
      id: "daily_journals_2026-07-02",
      data: {
        id: "daily_journals_2026-07-02",
        date: "2026-07-02",
        accomplishments: "Saved",
        to_improve: "",
        went_well: "",
        updated_at: "2026-07-02T12:00:00.000Z",
      },
      options: { merge: true },
    }]);
  });

  it("writes dashboard-independent diaries to deterministic date documents without reading", async () => {
    const { db, writes } = createWriteOnlyDb();

    const row = await writeDailyDiary({
      date: "2026-07-03",
      content: "Kept this out of the weekly dashboard",
      updated_at: "2026-07-03T12:00:00.000Z",
    }, db);

    assert.equal(row.id, "daily_diaries_2026-07-03");
    assert.deepEqual(writes, [{
      collectionName: "daily_diaries",
      id: "daily_diaries_2026-07-03",
      data: {
        id: "daily_diaries_2026-07-03",
        date: "2026-07-03",
        content: "Kept this out of the weekly dashboard",
        created_at: "2026-07-03T12:00:00.000Z",
        updated_at: "2026-07-03T12:00:00.000Z",
      },
      options: { merge: true },
    }]);
  });

  it("writes todo creates and updates directly by id", async () => {
    const { db, writes } = createWriteOnlyDb();

    await writeDailyTodo({
      id: "local_1",
      date: "2026-07-02",
      text: "Write it down",
      completed: true,
      sort_order: 2,
      created_at: "2026-07-02T11:00:00.000Z",
      updated_at: "2026-07-02T12:00:00.000Z",
    }, db);
    await patchDailyTodo({
      id: "local_1",
      date: "2026-07-02",
      completed: false,
      updated_at: "2026-07-02T13:00:00.000Z",
    }, db);

    assert.equal(writes.length, 2);
    assert.equal(writes[0].collectionName, "daily_todos");
    assert.equal(writes[0].id, "local_1");
    assert.equal(writes[0].data?.completed, true);
    assert.equal(writes[0].data?.category, "personal");
    assert.equal(writes[1].id, "local_1");
    assert.equal(writes[1].data?.completed, false);
    assert.equal(writes[1].data?.updated_at, "2026-07-02T13:00:00.000Z");
  });

  it("stores the todo category and defaults legacy rows to personal", async () => {
    const { db, writes } = createWriteOnlyDb();

    await writeDailyTodo({
      id: "local_school",
      date: "2026-07-02",
      text: "학교 업무",
      category: "school",
    }, db);
    await writeDailyTodo({
      id: "local_legacy",
      date: "2026-07-02",
      text: "카테고리 없던 시절 데이터",
      category: "something-else",
    }, db);
    await patchDailyTodo({
      id: "local_school",
      category: "personal",
      updated_at: "2026-07-02T13:00:00.000Z",
    }, db);

    assert.equal(writes[0].data?.category, "school");
    assert.equal(writes[1].data?.category, "personal");
    assert.equal(writes[2].data?.category, "personal");

    await assert.rejects(
      patchDailyTodo({ id: "local_school", category: "invalid" }, db),
      /category must be one of: school, personal/,
    );
  });

  it("writes habit toggles as latest state rows", async () => {
    const { db, writes } = createWriteOnlyDb();

    const row = await writeHabitLog({
      habit_id: "exercise",
      date: "2026-07-02",
      completed: false,
      updated_at: "2026-07-02T12:00:00.000Z",
    }, db);

    assert.equal(row.id, "habit_logs_exercise_2026-07-02");
    assert.equal(writes[0].collectionName, "habit_logs");
    assert.equal(writes[0].id, "habit_logs_exercise_2026-07-02");
    assert.equal(writes[0].data?.completed, false);
  });

  it("rolls over incomplete past todos to today", async () => {
    const { db, writes } = createQueryDb([
      { id: "t_old_open", date: "2026-08-25", completed: false },
      { id: "t_old_done", date: "2026-08-25", completed: true },
      { id: "t_older_open", date: "2026-08-01", completed: false },
      { id: "t_today_open", date: "2026-08-26", completed: false },
      { id: "t_ancient_open", date: "2026-06-01", completed: false },
    ]);

    const moved = await rolloverIncompleteTodos(
      { today: "2026-08-26", updated_at: "2026-08-26T00:10:00.000Z" },
      db,
    );

    assert.deepEqual(moved.sort(), ["t_old_open", "t_older_open"]);
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.deepEqual(write.data, {
        date: "2026-08-26",
        updated_at: "2026-08-26T00:10:00.000Z",
      });
      assert.deepEqual(write.options, { merge: true });
    }
  });

  it("rollover leaves everything alone when nothing is pending", async () => {
    const { db, writes } = createQueryDb([
      { id: "t_done", date: "2026-08-25", completed: true },
      { id: "t_today", date: "2026-08-26", completed: false },
    ]);

    const moved = await rolloverIncompleteTodos({ today: "2026-08-26" }, db);

    assert.deepEqual(moved, []);
    assert.equal(writes.length, 0);
  });

  it("uses stable document id helpers", () => {
    assert.equal(dailyJournalDocId("2026-07-02"), "daily_journals_2026-07-02");
    assert.equal(dailyDiaryDocId("2026-07-02"), "daily_diaries_2026-07-02");
    assert.equal(habitLogDocId("a/b", "2026-07-02"), "habit_logs_a_b_2026-07-02");
  });
});
