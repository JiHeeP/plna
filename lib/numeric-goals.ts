import type { NumericTarget } from "./types";

/**
 * 목표 화면 '수치 목표'. 정의는 코드에 고정하고, 기록(numeric_logs)은
 * 아래 id를 target_id로 쌓는다. 예전 numeric_targets 문서는 더 이상 쓰지 않는다.
 */
export const NUMERIC_GOALS: NumericTarget[] = [
  { id: "indie-followers", name: "팔로워", unit: "명", target_value: 100, pillar: "career", created_at: "2026-10-03" },
  { id: "monthly-extra-income", name: "추가 수입", unit: "만원", target_value: 50, pillar: "career", created_at: "2026-10-03" },
  { id: "wedding-fund", name: "결혼자금", unit: "만원", target_value: 2850, pillar: "assets", created_at: "2026-10-03" },
];

export const NUMERIC_GOAL_IDS = new Set(NUMERIC_GOALS.map((g) => g.id));
