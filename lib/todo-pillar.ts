import type { Pillar } from "./types";

/** 할 일에 붙일 수 있는 삶의 3필러. 필러가 없는 할 일(null)도 허용한다. */
export const TODO_PILLARS: readonly Pillar[] = ["career", "identity", "assets"];

/** 할 일 칩처럼 좁은 자리에 쓰는 짧은 이름. */
export const TODO_PILLAR_SHORT_LABELS: Record<Pillar, string> = {
  career: "일",
  identity: "나다운 나",
  assets: "자산",
};

export function isTodoPillar(value: unknown): value is Pillar {
  return typeof value === "string" && (TODO_PILLARS as readonly string[]).includes(value);
}

// 필러 도입 전 할 일에는 pillar 필드가 없다. 모르는 값도 "필러 없음"(null)으로 본다.
export function normalizeTodoPillar(value: unknown): Pillar | null {
  return isTodoPillar(value) ? value : null;
}

export interface PillarWeekSummary {
  pillar: Pillar;
  todoCompleted: number;
  todoTotal: number;
  goalCompleted: number;
  goalTotal: number;
}

export interface WeeklyPillarBalance {
  pillars: PillarWeekSummary[];
  /** 필러를 고르지 않은 할 일 */
  untagged: { todoCompleted: number; todoTotal: number };
}

/** 이번 주 할 일과 주간 목표를 필러별로 센다. */
export function summarizeWeeklyPillars(
  todos: ReadonlyArray<{ completed: boolean; pillar?: unknown }>,
  goals: ReadonlyArray<{ completed: boolean; pillar?: unknown }>,
): WeeklyPillarBalance {
  const pillars = TODO_PILLARS.map((pillar) => ({
    pillar,
    todoCompleted: 0,
    todoTotal: 0,
    goalCompleted: 0,
    goalTotal: 0,
  }));
  const byPillar = new Map(pillars.map((row) => [row.pillar, row]));
  const untagged = { todoCompleted: 0, todoTotal: 0 };

  for (const todo of todos) {
    const pillar = normalizeTodoPillar(todo.pillar);
    const row = pillar ? byPillar.get(pillar)! : untagged;
    row.todoTotal += 1;
    if (todo.completed) row.todoCompleted += 1;
  }

  for (const goal of goals) {
    const pillar = normalizeTodoPillar(goal.pillar);
    if (!pillar) continue;
    const row = byPillar.get(pillar)!;
    row.goalTotal += 1;
    if (goal.completed) row.goalCompleted += 1;
  }

  return { pillars, untagged };
}
