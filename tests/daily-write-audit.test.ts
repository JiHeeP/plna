import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildDailyWriteAuditRecord } from "../lib/firebase/daily-write-audit";

describe("daily write audit records", () => {
  it("stores only daily write metadata without content fields", () => {
    const record = buildDailyWriteAuditRecord(
      {
        target: "journal",
        action: "upsert",
        status: "error",
        date: "2026-07-02",
        recordId: "journal-1",
        errorMessage: "8 RESOURCE_EXHAUSTED: Quota exceeded.",
        metadata: {
          has_accomplishments: true,
          has_went_well: false,
          has_to_improve: true,
          ignored: undefined,
        },
      },
      new Date("2026-07-02T12:00:00.000Z"),
    );

    assert.deepEqual(record, {
      created_at: "2026-07-02T12:00:00.000Z",
      target: "journal",
      target_collection: "daily_journals",
      action: "upsert",
      status: "error",
      date: "2026-07-02",
      record_id: "journal-1",
      error_message: "8 RESOURCE_EXHAUSTED: Quota exceeded.",
      metadata: {
        has_accomplishments: true,
        has_went_well: false,
        has_to_improve: true,
      },
    });
  });
});
