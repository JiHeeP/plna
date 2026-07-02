import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveLatestDailyDashboardWeek,
  resolveLatestDashboardWeek,
} from "../lib/utils";

describe("weekly dashboard week resolution", () => {
  it("prefers the latest daily record week over later weekly goal weeks", () => {
    assert.equal(
      resolveLatestDashboardWeek({
        latestLogDate: "2026-06-29",
        latestJournalDate: "2026-06-30",
        latestTodoDate: "2026-07-01",
        latestGoalWeek: "2026-W40",
        latestReflectionWeek: "2026-W41",
      }),
      "2026-W27",
    );
  });

  it("counts todos as daily dashboard records when picking the latest daily week", () => {
    assert.equal(
      resolveLatestDailyDashboardWeek({
        latestLogDate: null,
        latestJournalDate: null,
        latestTodoDate: "2026-07-02",
      }),
      "2026-W27",
    );
  });

  it("uses weekly goal and reflection weeks only when no daily records exist", () => {
    assert.equal(
      resolveLatestDashboardWeek({
        latestGoalWeek: "2026-W20",
        latestReflectionWeek: "2026-W21",
      }),
      "2026-W21",
    );
  });

  it("falls back to the provided date when no dashboard data exists", () => {
    assert.equal(
      resolveLatestDashboardWeek({
        fallbackDate: new Date("2026-07-02T00:00:00"),
      }),
      "2026-W27",
    );
  });
});
