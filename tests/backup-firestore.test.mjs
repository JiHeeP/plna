import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditDateFormats, classifyDate } from "../scripts/check-date-formats.mjs";
import { decryptBackup, dumpFirestore, encryptBackup, parseServiceAccount, toJsonValue } from "../scripts/backup-firestore.mjs";

describe("firestore backup", () => {
  it("round-trips encryption and rejects a wrong passphrase", () => {
    const text = JSON.stringify({ hello: "일기" });
    const encrypted = encryptBackup(text, "pass-1");
    assert.equal(encrypted.includes(Buffer.from("일기")), false);
    assert.equal(decryptBackup(encrypted, "pass-1"), text);
    assert.throws(() => decryptBackup(encrypted, "wrong"));
    assert.throws(() => decryptBackup(Buffer.from("plain json"), "pass-1"));
  });

  it("keeps timestamps distinguishable", () => {
    const ts = { toDate: () => new Date("2026-11-17T00:00:00.000Z") };
    assert.deepEqual(toJsonValue({ date: ts, list: [1, null], nested: { a: "b" } }), {
      date: { __timestamp: "2026-11-17T00:00:00.000Z" },
      list: [1, null],
      nested: { a: "b" },
    });
  });

  it("dumps every collection and document", async () => {
    const collection = (id, docs) => ({
      id,
      get: async () => ({
        docs: docs.map((doc) => ({ id: doc.id, data: () => doc.data, ref: { listCollections: async () => [] } })),
      }),
    });
    const db = {
      listCollections: async () => [
        collection("daily_todos", [{ id: "t1", data: { text: "a" } }]),
        collection("weekly_goals", [{ id: "w1", data: { text: "b" } }, { id: "w2", data: { text: "c" } }]),
      ],
    };
    const dump = await dumpFirestore(db);
    assert.deepEqual(Object.keys(dump), ["daily_todos", "weekly_goals"]);
    assert.equal(dump.weekly_goals.length, 2);
    assert.deepEqual(dump.daily_todos[0], { id: "t1", data: { text: "a" } });
  });
});

describe("date format audit", () => {
  it("classifies values", () => {
    assert.equal(classifyDate("2026-11-17"), "string");
    assert.equal(classifyDate({ toDate: () => new Date() }), "timestamp");
    assert.equal(classifyDate(undefined), "missing");
    assert.equal(classifyDate("11/17"), "other_string");
  });

  it("counts per collection with a date field only", async () => {
    const col = (id, rows) => ({ id, get: async () => ({ docs: rows.map((data) => ({ data: () => data })) }) });
    const db = {
      listCollections: async () => [
        col("daily_todos", [{ date: "2026-11-17" }, { date: { toDate: () => new Date() } }]),
        col("weekly_goals", [{ week: "2026-W47" }]),
      ],
    };
    assert.deepEqual(await auditDateFormats(db), { daily_todos: { string: 1, timestamp: 1 } });
  });
});

describe("service account parsing", () => {
  const account = { project_id: "p", client_email: "a@p.iam", private_key: "k" };
  const json = JSON.stringify(account);

  it("accepts raw, quoted, double-encoded and base64 JSON", () => {
    assert.deepEqual(parseServiceAccount(json), account);
    assert.deepEqual(parseServiceAccount(`  ${json}\n`), account);
    assert.deepEqual(parseServiceAccount(`'${json}'`), account);
    assert.deepEqual(parseServiceAccount(JSON.stringify(json)), account);
    assert.deepEqual(parseServiceAccount(Buffer.from(json).toString("base64")), account);
  });

  it("never echoes the secret in errors", () => {
    const secret = "not-a-json-secret-value";
    assert.throws(() => parseServiceAccount(secret), (error) => !String(error.message).includes(secret));
  });
});
