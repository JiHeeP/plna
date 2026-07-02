import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dailyJournalDocId,
  habitLogDocId,
  patchDailyTodo,
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
    assert.equal(writes[1].id, "local_1");
    assert.equal(writes[1].data?.completed, false);
    assert.equal(writes[1].data?.updated_at, "2026-07-02T13:00:00.000Z");
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

  it("uses stable document id helpers", () => {
    assert.equal(dailyJournalDocId("2026-07-02"), "daily_journals_2026-07-02");
    assert.equal(habitLogDocId("a/b", "2026-07-02"), "habit_logs_a_b_2026-07-02");
  });
});
