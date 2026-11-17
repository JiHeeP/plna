import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTodoPillar, summarizeWeeklyPillars } from "../lib/todo-pillar";

test("normalizeTodoPillar keeps known pillars and maps old/unknown data to null", () => {
  assert.equal(normalizeTodoPillar("career"), "career");
  assert.equal(normalizeTodoPillar("assets"), "assets");
  assert.equal(normalizeTodoPillar(undefined), null);
  assert.equal(normalizeTodoPillar(null), null);
  assert.equal(normalizeTodoPillar("health"), null);
});

test("summarizeWeeklyPillars counts todos and weekly goals per pillar", () => {
  const result = summarizeWeeklyPillars(
    [
      { completed: true, pillar: "career" },
      { completed: false, pillar: "career" },
      { completed: true, pillar: "identity" },
      { completed: true },
      { completed: false, pillar: "unknown" },
    ],
    [
      { completed: true, pillar: "career" },
      { completed: false, pillar: "assets" },
    ],
  );

  assert.deepEqual(result.pillars, [
    { pillar: "career", todoCompleted: 1, todoTotal: 2, goalCompleted: 1, goalTotal: 1 },
    { pillar: "identity", todoCompleted: 1, todoTotal: 1, goalCompleted: 0, goalTotal: 0 },
    { pillar: "assets", todoCompleted: 0, todoTotal: 0, goalCompleted: 0, goalTotal: 1 },
  ]);
  assert.deepEqual(result.untagged, { todoCompleted: 1, todoTotal: 2 });
});
