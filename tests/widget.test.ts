import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWidgetSummary,
  dateStringInTimeZone,
  describeNextUp,
  getDDay,
  pickAffirmation,
} from "../lib/widget";
import { authorizeWidgetRequest, resolveWidgetDate, widgetCacheControl } from "../lib/widget-data";

const GENERATED_AT = new Date("2026-08-24T00:00:00.000Z");

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous = Object.keys(env).map((key) => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("widget date handling", () => {
  it("uses the Seoul calendar date for an instant that is still the previous day in UTC", () => {
    // 2026-08-23T16:00Z 는 서울에서 이미 8월 24일이다.
    assert.equal(dateStringInTimeZone(new Date("2026-08-23T16:00:00Z"), "Asia/Seoul"), "2026-08-24");
    assert.equal(dateStringInTimeZone(new Date("2026-08-23T16:00:00Z"), "UTC"), "2026-08-23");
  });

  it("falls back to UTC for an unknown time zone instead of throwing", () => {
    assert.equal(dateStringInTimeZone(new Date("2026-08-23T16:00:00Z"), "Not/AZone"), "2026-08-23");
  });

  it("matches the home screen D+ counter (2026-01-01 is D+0)", () => {
    assert.equal(getDDay("2026-01-01"), 0);
    assert.equal(getDDay("2026-08-24"), 235);
  });

  it("keeps the affirmation stable for a date and only changes across days", () => {
    assert.equal(pickAffirmation("2026-08-24"), pickAffirmation("2026-08-24"));
    assert.notEqual(pickAffirmation("2026-08-24"), pickAffirmation("2026-08-25"));
  });

  it("accepts an explicit date override but rejects malformed input", () => {
    assert.equal(resolveWidgetDate("2026-03-07"), "2026-03-07");
    assert.equal(
      resolveWidgetDate("not-a-date"),
      dateStringInTimeZone(new Date(), "Asia/Seoul"),
    );
  });
});

describe("widget summary", () => {
  const rows = {
    habits: [
      { id: "h1", name: "기상 6시" },
      { id: "h2", name: "운동 30분" },
      { id: "h3", name: "명상 5분" },
      { id: "h4", name: "책 읽기" },
    ],
    habitLogs: [{ habit_id: "h1", completed: true }, { habit_id: "h3", completed: true }],
    todos: [
      { text: "코드 리뷰", completed: true, sort_order: 1 },
      { text: "수업안 초안", completed: false, sort_order: 3 },
      { text: "자료 정리", completed: false, sort_order: 2 },
      { text: "메일 회신", completed: false, sort_order: 4 },
      { text: "장보기", completed: false, sort_order: 5 },
    ],
    weeklyGoals: [
      { text: "완료된 목표", pillar: "career" as const, completed: true, sort_order: 1 },
      { text: "문해력 수업안 완성", pillar: "identity" as const, completed: false, sort_order: 2 },
    ],
  };

  const summary = buildWidgetSummary("2026-08-24", rows, GENERATED_AT);

  it("counts only habits that have a completed log", () => {
    assert.equal(summary.habits.done, 2);
    assert.equal(summary.habits.total, 4);
    assert.equal(summary.habits.percent, 50);
    assert.deepEqual(summary.habits.remaining, ["운동 30분", "책 읽기"]);
  });

  it("reports open todos in sort order and caps the preview at three", () => {
    assert.equal(summary.todos.total, 5);
    assert.equal(summary.todos.done, 1);
    assert.equal(summary.todos.remaining, 4);
    assert.deepEqual(summary.todos.next, ["자료 정리", "수업안 초안", "메일 회신"]);
  });

  it("focuses the first unfinished weekly goal", () => {
    assert.deepEqual(summary.weeklyGoal, {
      text: "문해력 수업안 완성",
      pillar: "identity",
      completed: false,
    });
  });

  it("derives the header fields from the date", () => {
    assert.equal(summary.label, "8월 24일");
    assert.equal(summary.weekday, "월");
    assert.equal(summary.week, "2026-W35");
    assert.equal(summary.dDay, 235);
  });

  it("truncates long text so it cannot overflow the widget image", () => {
    const long = buildWidgetSummary(
      "2026-08-24",
      {
        habits: [],
        habitLogs: [],
        todos: [{ text: "가".repeat(60), completed: false, sort_order: 1 }],
        weeklyGoals: [{ text: "나".repeat(60), pillar: "assets", completed: false, sort_order: 1 }],
      },
      GENERATED_AT,
    );
    assert.equal(long.todos.next[0].length, 28);
    assert.ok(long.todos.next[0].endsWith("…"));
    assert.equal(long.weeklyGoal?.text.length, 34);
  });

  it("handles a day with no data without dividing by zero", () => {
    const empty = buildWidgetSummary(
      "2026-08-24",
      { habits: [], habitLogs: [], todos: [], weeklyGoals: [] },
      GENERATED_AT,
    );
    assert.equal(empty.habits.percent, 0);
    assert.equal(empty.todos.remaining, 0);
    assert.equal(empty.weeklyGoal, null);
    assert.ok(empty.affirmation.length > 0);
  });
});

describe("widget authorization", () => {
  const url = "https://example.com/api/widget";

  it("stays disabled until a token is configured", () => {
    const result = withEnv({ PLNA_WIDGET_TOKEN: undefined }, () =>
      authorizeWidgetRequest(new Request(`${url}?token=anything`)),
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 503);
  });

  it("rejects a missing or wrong token", () => {
    withEnv({ PLNA_WIDGET_TOKEN: "correct-token" }, () => {
      assert.equal(authorizeWidgetRequest(new Request(url)).ok, false);
      assert.equal(authorizeWidgetRequest(new Request(`${url}?token=wrong`)).ok, false);
      assert.equal(authorizeWidgetRequest(new Request(`${url}?token=correct-token-longer`)).ok, false);
    });
  });

  it("accepts the token from the query string or the Authorization header", () => {
    withEnv({ PLNA_WIDGET_TOKEN: "correct-token" }, () => {
      const query = authorizeWidgetRequest(new Request(`${url}?token=correct-token`));
      assert.deepEqual(query, { ok: true, via: "query" });

      const header = authorizeWidgetRequest(
        new Request(url, { headers: { authorization: "Bearer correct-token" } }),
      );
      assert.deepEqual(header, { ok: true, via: "header" });
    });
  });
});

describe("widget cache headers", () => {
  it("never lets a shared cache store a header-authenticated response", () => {
    // CDN 캐시 키에는 헤더가 들어가지 않으므로, 헤더 인증은 private 이어야 한다.
    withEnv({ PLNA_WIDGET_CACHE_SECONDS: "300" }, () => {
      assert.equal(widgetCacheControl("header"), "private, max-age=300");
      assert.equal(
        widgetCacheControl("query"),
        "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      );
    });
  });

  it("disables caching entirely when the TTL is zero", () => {
    withEnv({ PLNA_WIDGET_CACHE_SECONDS: "0" }, () => {
      assert.equal(widgetCacheControl("query"), "private, no-store");
    });
  });
});

describe("widget next-up panel", () => {
  function summaryFor(rows: Parameters<typeof buildWidgetSummary>[1]) {
    return buildWidgetSummary("2026-08-24", rows, GENERATED_AT);
  }

  it("shows open todos first, capped at two lines", () => {
    const panel = describeNextUp(
      summaryFor({
        habits: [{ id: "h1", name: "운동 30분" }],
        habitLogs: [],
        todos: [
          { text: "가", completed: false, sort_order: 1 },
          { text: "나", completed: false, sort_order: 2 },
          { text: "다", completed: false, sort_order: 3 },
        ],
        weeklyGoals: [],
      }),
    );
    assert.equal(panel.heading, "남은 할 일 3개");
    assert.deepEqual(panel.lines, ["가", "나"]);
  });

  it("falls back to unfinished habits once every todo is done", () => {
    const panel = describeNextUp(
      summaryFor({
        habits: [
          { id: "h1", name: "운동 30분" },
          { id: "h2", name: "책 읽기" },
        ],
        habitLogs: [],
        todos: [{ text: "가", completed: true, sort_order: 1 }],
        weeklyGoals: [],
      }),
    );
    assert.equal(panel.heading, "남은 습관 2개");
    assert.deepEqual(panel.lines, ["운동 30분", "책 읽기"]);
  });

  it("reports completion when nothing is left", () => {
    const panel = describeNextUp(
      summaryFor({
        habits: [{ id: "h1", name: "운동 30분" }],
        habitLogs: [{ habit_id: "h1", completed: true }],
        todos: [{ text: "가", completed: true, sort_order: 1 }],
        weeklyGoals: [],
      }),
    );
    assert.equal(panel.heading, "오늘 할 일 완료");
    assert.deepEqual(panel.lines, []);
  });

  it("distinguishes a day with no records at all", () => {
    const panel = describeNextUp(
      summaryFor({ habits: [], habitLogs: [], todos: [], weeklyGoals: [] }),
    );
    assert.equal(panel.heading, "오늘 기록 없음");
    assert.deepEqual(panel.lines, []);
  });

  it("never repeats the affirmation in the panel, so the footer stays the only place it appears", () => {
    const summary = summaryFor({ habits: [], habitLogs: [], todos: [], weeklyGoals: [] });
    assert.ok(!describeNextUp(summary).lines.includes(summary.affirmation));
  });
});
