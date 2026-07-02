import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLocalDailyBackupPayloadFromEntries,
  buildLocalDailyDashboardData,
  createLocalDailyBackupPayloadSignature,
  hasLocalDailyBackupPayload,
  normalizeLocalDailyBackupPayload,
} from "../lib/local-daily-backup";

describe("local daily backup sync payload", () => {
  it("collects journal, todo, and habit localStorage backups by date", () => {
    const payload = buildLocalDailyBackupPayloadFromEntries([
      [
        "journal_2026-07-01",
        JSON.stringify({
          accomplishments: "wrote a note",
          to_improve: "sleep",
          went_well: "focus",
        }),
      ],
      [
        "todos_2026-07-01",
        JSON.stringify([
          {
            id: "local_1",
            text: "Plan the day",
            completed: true,
            sort_order: 2,
            created_at: "2026-07-01T00:00:00.000Z",
          },
          { id: "empty", text: "   " },
        ]),
      ],
      [
        "habits_2026-07-01",
        JSON.stringify({
          morning_pages: true,
          stretch: false,
        }),
      ],
    ]);

    assert.deepEqual(payload, {
      journals: [
        {
          date: "2026-07-01",
          accomplishments: "wrote a note",
          to_improve: "sleep",
          went_well: "focus",
        },
      ],
      todos: [
        {
          id: "local_1",
          date: "2026-07-01",
          text: "Plan the day",
          completed: true,
          sort_order: 2,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      habitChecks: [
        {
          date: "2026-07-01",
          habitNameEn: "morning_pages",
        },
      ],
    });
    assert.equal(hasLocalDailyBackupPayload(payload), true);
  });

  it("drops invalid dates and empty rows before sending to the server", () => {
    const payload = normalizeLocalDailyBackupPayload({
      journals: [
        { date: "2026-07-02", accomplishments: "", to_improve: "", went_well: "" },
        { date: "07-02-2026", accomplishments: "bad date" },
      ],
      todos: [
        { date: "2026-07-02", text: "  Keep this  ", completed: false },
        { date: "2026-07-02", text: "" },
      ],
      habitChecks: [
        { date: "2026-07-02", habitNameEn: "read" },
        { date: "tomorrow", habitNameEn: "skip" },
      ],
    });

    assert.deepEqual(payload, {
      journals: [],
      todos: [
        {
          id: undefined,
          date: "2026-07-02",
          text: "Keep this",
          completed: false,
          sort_order: 0,
          created_at: undefined,
        },
      ],
      habitChecks: [
        {
          date: "2026-07-02",
          habitNameEn: "read",
        },
      ],
    });
  });

  it("builds a weekly dashboard fallback from local backup rows", () => {
    const payload = normalizeLocalDailyBackupPayload({
      journals: [
        {
          date: "2026-07-01",
          accomplishments: "shipped dashboard fallback",
          went_well: "caught quota failure",
          to_improve: "reduce reads",
        },
      ],
      todos: [
        { id: "todo_2", date: "2026-07-01", text: "Second", completed: false, sort_order: 2 },
        { id: "todo_1", date: "2026-07-01", text: "First", completed: true, sort_order: 1 },
      ],
      habitChecks: [
        { date: "2026-07-01", habitNameEn: "read" },
        { date: "2026-07-02", habitNameEn: "stretch" },
      ],
    });

    const dashboard = buildLocalDailyDashboardData(payload);

    assert.equal(dashboard?.week, "2026-W27");
    assert.equal(dashboard?.dailyData.length, 7);

    const wednesday = dashboard?.dailyData.find((day) => day.date === "2026-07-01");
    assert.deepEqual(wednesday, {
      date: "2026-07-01",
      habitRate: 50,
      habitCompleted: 1,
      habitTotal: 2,
      todoCompleted: 1,
      todoTotal: 2,
      todos: [
        { id: "todo_1", text: "First", completed: true },
        { id: "todo_2", text: "Second", completed: false },
      ],
      accomplishments: "shipped dashboard fallback",
      went_well: "caught quota failure",
      to_improve: "reduce reads",
    });
  });

  it("returns null when the requested local backup week has no rows", () => {
    const payload = normalizeLocalDailyBackupPayload({
      journals: [{ date: "2026-07-01", accomplishments: "only W27" }],
    });

    assert.equal(buildLocalDailyDashboardData(payload, "2026-W26"), null);
  });

  it("creates a stable sync signature regardless of localStorage iteration order", () => {
    const first = buildLocalDailyBackupPayloadFromEntries([
      ["todos_2026-07-02", JSON.stringify([{ id: "b", text: "B", sort_order: 2 }])],
      ["journal_2026-07-01", JSON.stringify({ went_well: "A" })],
      ["habits_2026-07-01", JSON.stringify({ stretch: true, read: true })],
    ]);
    const second = buildLocalDailyBackupPayloadFromEntries([
      ["habits_2026-07-01", JSON.stringify({ read: true, stretch: true })],
      ["journal_2026-07-01", JSON.stringify({ went_well: "A" })],
      ["todos_2026-07-02", JSON.stringify([{ id: "b", text: "B", sort_order: 2 }])],
    ]);

    assert.equal(
      createLocalDailyBackupPayloadSignature(first),
      createLocalDailyBackupPayloadSignature(second),
    );
  });
});
