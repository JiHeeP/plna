import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TABLES,
  buildSupabaseRestUrl,
  chunkRows,
  parseArgs,
  resolveDocumentId,
  sanitizeDocumentData,
} from "../scripts/migrate-supabase-to-firestore.mjs";

describe("Supabase to Firestore migration helpers", () => {
  it("lists every application collection once", () => {
    const expectedTables = [
      "affirmations",
      "daily_habits",
      "habit_logs",
      "conversations",
      "conversation_topics",
      "milestones",
      "numeric_targets",
      "numeric_logs",
      "kakao_tokens",
      "notification_settings",
      "ops_backlog_items",
      "daily_todos",
      "daily_journals",
      "monthly_goals",
      "weekly_goals",
      "weekly_reflections",
      "quarterly_goals",
      "sub_goals",
    ];

    assert.deepEqual(DEFAULT_TABLES, expectedTables);
    assert.equal(new Set(DEFAULT_TABLES).size, DEFAULT_TABLES.length);
  });

  it("parses dry-run and table filters from CLI args", () => {
    assert.deepEqual(parseArgs(["--dry-run", "--only=daily_todos, weekly_goals "]), {
      dryRun: true,
      limit: 1000,
      tables: ["daily_todos", "weekly_goals"],
    });
  });

  it("builds paginated Supabase REST select URLs", () => {
    const url = buildSupabaseRestUrl("https://example.supabase.co/", "daily_todos", {
      limit: 250,
      offset: 500,
    });

    assert.equal(url.origin, "https://example.supabase.co");
    assert.equal(url.pathname, "/rest/v1/daily_todos");
    assert.equal(url.searchParams.get("select"), "*");
    assert.equal(url.searchParams.get("order"), "id.asc");
    assert.equal(url.searchParams.get("limit"), "250");
    assert.equal(url.searchParams.get("offset"), "500");
  });

  it("uses the source id as a Firestore document id", () => {
    assert.equal(resolveDocumentId("daily_todos", { id: "todo-1", text: "call" }, 12), "todo-1");
    assert.equal(resolveDocumentId("kakao_tokens", { id: 1 }, 0), "1");
    assert.equal(resolveDocumentId("audit_log", { event: "created" }, 4), "audit_log_4");
  });

  it("removes undefined values without dropping nulls", () => {
    assert.deepEqual(
      sanitizeDocumentData({
        id: "row-1",
        text: "hello",
        empty: null,
        skip: undefined,
      }),
      {
        id: "row-1",
        text: "hello",
        empty: null,
      },
    );
  });

  it("chunks rows below the Firestore batch operation limit", () => {
    const chunks = chunkRows(Array.from({ length: 905 }, (_, index) => ({ id: index })), 450);

    assert.equal(chunks.length, 3);
    assert.deepEqual(
      chunks.map((chunk) => chunk.length),
      [450, 450, 5],
    );
  });
});
