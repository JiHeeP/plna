import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { displayHabitName } from "../lib/habit-display";

describe("habit display names", () => {
  it("maps renamed habits to their short display names", () => {
    assert.equal(displayHabitName("문해력 증진 방법 연구"), "연구");
    assert.equal(displayHabitName("코딩/AI 다루기"), "ai");
    assert.equal(displayHabitName("코딩"), "ai");
  });

  it("keeps every other habit name unchanged", () => {
    assert.equal(displayHabitName("책 읽기"), "책 읽기");
    assert.equal(displayHabitName(""), "");
  });
});
