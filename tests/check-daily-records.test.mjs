import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectDailyRecords,
  parseArgs,
} from "../scripts/check-daily-records.mjs";

function compareValues(left, operator, right) {
  if (left instanceof Date && right instanceof Date) {
    if (operator === ">=") return left.getTime() >= right.getTime();
    if (operator === "<=") return left.getTime() <= right.getTime();
  }

  if (typeof left === "string" && typeof right === "string") {
    if (operator === ">=") return left >= right;
    if (operator === "<=") return left <= right;
  }

  return false;
}

function createFakeDb(rowsByCollection) {
  return {
    collection(collectionName) {
      const filters = [];
      const query = {
        where(field, operator, value) {
          filters.push({ field, operator, value });
          return query;
        },
        async get() {
          const rows = rowsByCollection[collectionName] ?? [];
          return {
            docs: rows
              .filter((row) => filters.every((filter) =>
                compareValues(row[filter.field], filter.operator, filter.value)
              ))
              .map((row, index) => ({
                id: row.id ?? `${collectionName}-${index}`,
                data: () => row,
              })),
          };
        },
      };
      return query;
    },
  };
}

test("daily record diagnostics default to previous and current ISO weeks", () => {
  const options = parseArgs([], new Date("2026-07-02T12:00:00"));

  assert.equal(options.start, "2026-06-22");
  assert.equal(options.end, "2026-07-05");
});

test("daily record diagnostics accept one ISO week", () => {
  const options = parseArgs(["--week=2026-W27"], new Date("2026-07-02T12:00:00"));

  assert.equal(options.start, "2026-06-29");
  assert.equal(options.end, "2026-07-05");
});

test("daily record diagnostics summarize string and Timestamp date records", async () => {
  const report = await inspectDailyRecords(createFakeDb({
    daily_journals: [
      {
        id: "journal-1",
        date: "2026-07-01",
        accomplishments: "hidden content",
      },
      {
        id: "journal-2",
        date: new Date("2026-07-02T02:00:00.000Z"),
        went_well: "hidden content",
      },
    ],
    daily_todos: [
      {
        id: "todo-1",
        date: "2026-07-01",
        text: "hidden todo",
        completed: true,
      },
      {
        id: "todo-2",
        date: "2026-07-01",
        text: "hidden todo",
        completed: false,
      },
    ],
    habit_logs: [
      {
        id: "habit-log-1",
        date: new Date("2026-07-01T12:00:00.000Z"),
        completed: true,
      },
    ],
  }), {
    projectId: "plna-60b1d",
    start: "2026-07-01",
    end: "2026-07-02",
    includeAudit: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.collections.daily_journals.total, 2);
  assert.equal(report.collections.daily_journals.byDate["2026-07-01"].total, 1);
  assert.equal(report.collections.daily_journals.byDate["2026-07-02"].total, 1);
  assert.equal(report.collections.daily_todos.byDate["2026-07-01"].total, 2);
  assert.equal(report.collections.daily_todos.byDate["2026-07-01"].completed, 1);
  assert.equal(report.collections.habit_logs.byDate["2026-07-01"].total, 1);
  assert.equal(JSON.stringify(report).includes("hidden content"), false);
  assert.equal(JSON.stringify(report).includes("hidden todo"), false);
});
