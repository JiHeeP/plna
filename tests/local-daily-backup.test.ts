import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLocalDailyBackupPayloadFromEntries,
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
});
