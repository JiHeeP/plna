import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isAccessGateExemptPath } from "../lib/access-gate";
import {
  MAX_TEXT_LENGTH,
  authorizeClaude,
  parseDateRange,
  parseGoalPatch,
  parseTodoCreate,
  parseTodoPatch,
  parseWeeklyGoalCreate,
} from "../lib/claude-api";

function req(headers: Record<string, string> = {}) {
  return new Request("https://plna.example/api/claude/todos", { headers });
}

describe("claude api auth", () => {
  const original = process.env.PLNA_CLAUDE_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.PLNA_CLAUDE_TOKEN;
    else process.env.PLNA_CLAUDE_TOKEN = original;
  });

  it("is closed (503) when the token is unset or blank", () => {
    delete process.env.PLNA_CLAUDE_TOKEN;
    assert.deepEqual(authorizeClaude(req({ authorization: "Bearer x" })).ok, false);
    assert.equal((authorizeClaude(req()) as { status: number }).status, 503);
    process.env.PLNA_CLAUDE_TOKEN = "   ";
    assert.equal((authorizeClaude(req({ authorization: "Bearer x" })) as { status: number }).status, 503);
  });

  it("accepts only the exact bearer token", () => {
    process.env.PLNA_CLAUDE_TOKEN = "claude-secret";
    assert.equal(authorizeClaude(req({ authorization: "Bearer claude-secret" })).ok, true);
    assert.equal(authorizeClaude(req({ authorization: "bearer claude-secret" })).ok, true);
    assert.equal(authorizeClaude(req({ authorization: "Bearer claude-secret2" })).ok, false);
    assert.equal(authorizeClaude(req({ authorization: "Bearer " })).ok, false);
    assert.equal((authorizeClaude(req()) as { status: number }).status, 401);
  });

  it("ignores a token passed in the query string", () => {
    process.env.PLNA_CLAUDE_TOKEN = "claude-secret";
    const r = new Request("https://plna.example/api/claude/todos?token=claude-secret");
    assert.equal(authorizeClaude(r).ok, false);
  });

  it("bypasses the access-key gate (it has its own token)", () => {
    assert.equal(isAccessGateExemptPath("/api/claude/todos"), true);
    assert.equal(isAccessGateExemptPath("/api/claude/weekly-goals"), true);
    assert.equal(isAccessGateExemptPath("/api/todos"), false);
    assert.equal(isAccessGateExemptPath("/api/claudex"), false);
  });
});

describe("claude api validation", () => {
  it("parses date ranges and caps them at 31 days", () => {
    assert.deepEqual(parseDateRange("2026-10-26", "2026-11-01"), {
      ok: true,
      value: { from: "2026-10-26", to: "2026-11-01" },
    });
    assert.deepEqual(parseDateRange("2026-10-26", null), {
      ok: true,
      value: { from: "2026-10-26", to: "2026-10-26" },
    });
    assert.equal(parseDateRange("2026-10-26", "2026-10-25").ok, false);
    assert.equal(parseDateRange("2026-10-01", "2026-11-01").ok, false);
    assert.equal(parseDateRange("2026-02-30", null).ok, false);
    assert.equal(parseDateRange(null, null).ok, false);
  });

  it("creates todos with defaults and rejects bad input", () => {
    assert.deepEqual(parseTodoCreate({ date: "2026-10-29", text: "  루틴 수업  " }), {
      ok: true,
      value: { date: "2026-10-29", text: "루틴 수업", category: "personal", sort_order: 0 },
    });
    assert.equal(parseTodoCreate({ date: "2026-10-29", text: "x", category: "school" }).ok, true);
    assert.equal(parseTodoCreate({ date: "2026-10-29", text: "x", category: "nope" }).ok, false);
    assert.equal(parseTodoCreate({ date: "2026-10-29", text: "   " }).ok, false);
    assert.equal(parseTodoCreate({ date: "10/29", text: "x" }).ok, false);
    assert.equal(parseTodoCreate({ date: "2026-10-29", text: "a".repeat(MAX_TEXT_LENGTH + 1) }).ok, false);
    assert.equal(parseTodoCreate(null).ok, false);
    assert.equal(parseTodoCreate([]).ok, false);
  });

  it("patches only whitelisted todo fields", () => {
    const parsed = parseTodoPatch({ id: "abc", completed: true, owner: "evil", date: "2026-10-30" });
    assert.deepEqual(parsed, { ok: true, value: { id: "abc", completed: true, date: "2026-10-30" } });
    assert.equal(parseTodoPatch({ id: "abc" }).ok, false);
    assert.equal(parseTodoPatch({ id: "a/b", completed: true }).ok, false);
    assert.equal(parseTodoPatch({ id: "abc", completed: "yes" }).ok, false);
  });

  it("validates weekly goal creation", () => {
    assert.deepEqual(parseWeeklyGoalCreate({ week: "2026-W44", text: "조합 문의", pillar: "assets" }), {
      ok: true,
      value: { week: "2026-W44", text: "조합 문의", pillar: "assets" },
    });
    assert.equal(parseWeeklyGoalCreate({ week: "2026-44", text: "x", pillar: "assets" }).ok, false);
    assert.equal(parseWeeklyGoalCreate({ week: "2026-W44", text: "x", pillar: "general" }).ok, false);
  });

  it("goal patch allows only text and completed", () => {
    assert.deepEqual(parseGoalPatch({ id: "g1", text: "새 문구", pillar: "career", sort_order: 9 }), {
      ok: true,
      value: { id: "g1", text: "새 문구" },
    });
    assert.equal(parseGoalPatch({ id: "g1", pillar: "career" }).ok, false);
  });
});
