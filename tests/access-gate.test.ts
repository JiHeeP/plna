import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  accessCookieValue,
  constantTimeEqual,
  isAccessGateEnabled,
  isAccessGateExemptPath,
  isValidAccessCookie,
  isValidAccessKey,
  safeNextPath,
} from "../lib/access-gate";

describe("access gate", () => {
  const original = process.env.PLNA_ACCESS_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.PLNA_ACCESS_KEY;
    else process.env.PLNA_ACCESS_KEY = original;
  });

  it("is disabled when PLNA_ACCESS_KEY is unset or blank", async () => {
    delete process.env.PLNA_ACCESS_KEY;
    assert.equal(isAccessGateEnabled(), false);
    assert.equal(isValidAccessKey("anything"), false);
    assert.equal(await isValidAccessCookie("anything"), false);

    process.env.PLNA_ACCESS_KEY = "   ";
    assert.equal(isAccessGateEnabled(), false);
  });

  it("accepts the configured key and the matching cookie only", async () => {
    process.env.PLNA_ACCESS_KEY = "mom-secret";
    assert.equal(isAccessGateEnabled(), true);
    assert.equal(isValidAccessKey("mom-secret"), true);
    assert.equal(isValidAccessKey("mom-secret2"), false);
    assert.equal(isValidAccessKey(""), false);

    const cookie = await accessCookieValue("mom-secret");
    assert.match(cookie, /^[0-9a-f]{64}$/);
    assert.notEqual(cookie, "mom-secret");
    assert.equal(await isValidAccessCookie(cookie), true);
    assert.equal(await isValidAccessCookie(cookie.replace(/^./, "0")), false);
    assert.equal(await isValidAccessCookie(undefined), false);
  });

  it("derives a stable, key-specific cookie value", async () => {
    assert.equal(await accessCookieValue("a"), await accessCookieValue("a"));
    assert.notEqual(await accessCookieValue("a"), await accessCookieValue("b"));
  });

  it("exempts login, self-authenticated APIs, and static assets", () => {
    for (const path of [
      "/login",
      "/api/access",
      "/api/widget",
      "/api/widget/image",
      "/api/briefing",
      "/api/briefing/abc123",
      "/manifest.json",
      "/icons/icon.svg",
      "/icon.svg",
      "/daily-backup-recovery.js",
      "/_next/static/chunk.js",
    ]) {
      assert.equal(isAccessGateExemptPath(path), true, path);
    }
  });

  it("gates pages and data APIs", () => {
    for (const path of [
      "/",
      "/goals",
      "/stats",
      "/widget",
      "/api/habits",
      "/api/todos",
      "/api/local-daily-backup/sync",
      "/api/widgetry",
    ]) {
      assert.equal(isAccessGateExemptPath(path), false, path);
    }
  });

  it("compares strings without leaking on length or prefix", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "ab"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });

  it("only redirects back to same-site absolute paths", () => {
    assert.equal(safeNextPath("/goals?week=2026-W36"), "/goals?week=2026-W36");
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(""), "/");
    assert.equal(safeNextPath("goals"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/\\evil.example"), "/");
    assert.equal(safeNextPath("https://evil.example"), "/");
  });
});
