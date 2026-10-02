import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLastWeekReview, previousWeekRange } from "../lib/briefing-weekly";

describe("previousWeekRange", () => {
  it("returns the Mon-Sun of the previous ISO week on a Monday", () => {
    assert.deepEqual(previousWeekRange("2026-10-05"), {
      start: "2026-09-28",
      end: "2026-10-04",
      week: "2026-W40",
    });
  });

  it("returns the same previous week on a Sunday", () => {
    assert.deepEqual(previousWeekRange("2026-10-11"), {
      start: "2026-09-28",
      end: "2026-10-04",
      week: "2026-W40",
    });
  });

  it("crosses the year boundary", () => {
    assert.equal(previousWeekRange("2027-01-04").week, "2026-W53");
  });
});

describe("buildLastWeekReview", () => {
  const habits = [
    { id: "h1", name: "책 읽기" },
    { id: "h2", name: "명상" },
  ];

  it("computes habit, todo and weekly goal rates for the previous week only", () => {
    const review = buildLastWeekReview({
      date: "2026-10-05",
      habits,
      habitLogs: [
        { habit_id: "h1", date: "2026-09-28", completed: true },
        { habit_id: "h1", date: "2026-09-29", completed: true },
        { habit_id: "h2", date: "2026-10-04", completed: true },
        { habit_id: "h2", date: "2026-10-03", completed: false },
        { habit_id: "h1", date: "2026-09-27", completed: true }, // 지지난주 — 제외
        { habit_id: "old", date: "2026-09-30", completed: true }, // 비활성 습관 — 제외
      ],
      todos: [
        { date: "2026-09-28", text: "인디 글", completed: true, category: "school" },
        { date: "2026-10-02", text: "투자 정리", completed: false, category: "personal" },
        { date: "2026-10-05", text: "오늘 할 일", completed: false, category: "personal" },
      ],
      weeklyGoals: [
        { text: "B", pillar: "assets", completed: false, sort_order: 2 },
        { text: "A", pillar: "career", completed: true, sort_order: 1 },
      ],
    });

    assert.equal(review.week, "2026-W40");
    assert.equal(review.is_week_start, true);
    assert.equal(review.habits.completed, 3);
    assert.equal(review.habits.possible, 14);
    assert.equal(review.habits.rate, 21.4);
    assert.deepEqual(review.habits.by_habit, [
      { name: "책 읽기", completed_days: 2 },
      { name: "명상", completed_days: 1 },
    ]);
    assert.equal(review.todos.total, 2);
    assert.equal(review.todos.completed, 1);
    assert.equal(review.todos.rate, 50);
    assert.deepEqual(review.todos.incomplete, [
      { date: "2026-10-02", text: "투자 정리", category: "personal" },
    ]);
    assert.equal(review.weekly_goals.rate, 50);
    assert.deepEqual(
      review.weekly_goals.list.map((g) => g.text),
      ["A", "B"],
    );
  });

  it("returns null rates when there is nothing to measure", () => {
    const review = buildLastWeekReview({
      date: "2026-10-07",
      habits: [],
      habitLogs: [],
      todos: [],
      weeklyGoals: [],
    });
    assert.equal(review.is_week_start, false);
    assert.equal(review.habits.rate, null);
    assert.equal(review.todos.rate, null);
    assert.equal(review.weekly_goals.rate, null);
  });
});
