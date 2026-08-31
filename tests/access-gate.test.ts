import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accessCookieValue,
  decideAccess,
  isPublicPath,
  safeEqual,
} from "../lib/access-gate";

const KEY = "test-access-key";

describe("access gate paths", () => {
  it("lets the widget endpoints through — 홈 화면 위젯은 쿠키를 가질 수 없다", () => {
    assert.equal(isPublicPath("/api/widget"), true);
    assert.equal(isPublicPath("/api/widget/image"), true);
    assert.equal(isPublicPath("/api/widget/habits"), true);
  });

  it("lets static assets through", () => {
    assert.equal(isPublicPath("/_next/static/chunk.js"), true);
    assert.equal(isPublicPath("/manifest.json"), true);
    assert.equal(isPublicPath("/icons/icon.svg"), true);
  });

  it("guards everything else, including lookalike paths", () => {
    assert.equal(isPublicPath("/"), false);
    assert.equal(isPublicPath("/widget"), false);
    assert.equal(isPublicPath("/api/todos"), false);
    assert.equal(isPublicPath("/api/widgets"), false);
    assert.equal(isPublicPath("/manifest.json.bak"), false);
  });
});

describe("access gate cookie", () => {
  it("is stable for a key and different for another, and never contains the key", async () => {
    const value = await accessCookieValue(KEY);
    assert.equal(value, await accessCookieValue(KEY));
    assert.notEqual(value, await accessCookieValue(`${KEY}2`));
    assert.ok(!value.includes(KEY));
    assert.match(value, /^[0-9a-f]{64}$/);
  });

  it("compares without leaking length-independent differences", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "ab"), false);
  });
});

describe("access decisions", () => {
  const base = { pathname: "/", keyParam: null, cookie: null, configuredKey: KEY };

  it("closes the app when no key is configured, instead of leaving it open", async () => {
    assert.deepEqual(await decideAccess({ ...base, configuredKey: null }), {
      action: "disabled",
    });
  });

  it("still serves the widget endpoints when no key is configured", async () => {
    assert.deepEqual(
      await decideAccess({ ...base, pathname: "/api/widget/image", configuredKey: null }),
      { action: "allow" },
    );
  });

  it("grants a cookie when the magic link carries the right key", async () => {
    const decision = await decideAccess({ ...base, keyParam: KEY });
    assert.equal(decision.action, "grant");
    assert.equal(
      decision.action === "grant" ? decision.cookie : null,
      await accessCookieValue(KEY),
    );
  });

  it("refuses a wrong key and a wrong cookie", async () => {
    assert.deepEqual(await decideAccess({ ...base, keyParam: "nope" }), { action: "deny" });
    assert.deepEqual(await decideAccess({ ...base, cookie: "nope" }), { action: "deny" });
    assert.deepEqual(await decideAccess(base), { action: "deny" });
  });

  it("admits a device that already holds the cookie", async () => {
    assert.deepEqual(await decideAccess({ ...base, cookie: await accessCookieValue(KEY) }), {
      action: "allow",
    });
  });
});
