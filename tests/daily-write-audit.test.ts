import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyWriteAuditRecord,
  summarizeDailyWriteAudit,
  toPublicDailyWriteAuditRecord,
} from "../lib/firebase/daily-write-audit";

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

  it("exposes public audit records without record ids", () => {
    const record = toPublicDailyWriteAuditRecord({
      created_at: "2026-07-02T12:00:00.000Z",
      target: "todo",
      target_collection: "daily_todos",
      action: "update",
      status: "success",
      date: "2026-07-02",
      record_id: "todo-secret-id",
      error_message: null,
      metadata: {
        updates_text: true,
      },
    });

    assert.equal("record_id" in record, false);
    assert.deepEqual(record, {
      created_at: "2026-07-02T12:00:00.000Z",
      target: "todo",
      target_collection: "daily_todos",
      action: "update",
      status: "success",
      date: "2026-07-02",
      error_message: null,
      metadata: {
        updates_text: true,
      },
    });
  });

  it("summarizes audit records by status, target, and date", () => {
    const records = [
      toPublicDailyWriteAuditRecord({
        created_at: "2026-07-02T12:00:00.000Z",
        target: "journal",
        action: "upsert",
        status: "success",
        date: "2026-07-02",
      }),
      toPublicDailyWriteAuditRecord({
        created_at: "2026-07-02T12:01:00.000Z",
        target: "todo",
        action: "create",
        status: "error",
        date: "2026-07-02",
      }),
    ];

    assert.deepEqual(summarizeDailyWriteAudit(records), {
      by_status: {
        success: 1,
        error: 1,
      },
      by_target: {
        journal: 1,
        todo: 1,
      },
      by_date: {
        "2026-07-02": 2,
      },
      errors: 1,
      successes: 1,
    });
  });
});
