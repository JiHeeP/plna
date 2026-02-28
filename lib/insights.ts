/* ─────────────────────────────────────────────
 *  Unified Insight types & smart fallback
 * ───────────────────────────────────────────── */

export type Pillar = "career" | "identity" | "assets";

/* ── 메트릭 (확장) ── */

export interface PillarMilestoneStats {
  total: number;
  inProgress: number;
  completed: number;
}

export interface InsightMetrics {
  habitCompletionRate: number;
  todoCompletionRate: number;
  habitTrend: number; // 전 기간 대비 변화 (예: +7, -3)
  todoTrend: number;
  milestoneProgress: Record<Pillar, PillarMilestoneStats>;
  topHabits: string[]; // 가장 잘 지킨 습관 이름들
  bottomHabits: string[]; // 가장 못 지킨 습관 이름들
}

/* ── 스냅샷 ── */

export interface UnifiedInsightSnapshot {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  wentWell: string[];    // 3가지 포인트
  toImprove: string[];   // 3가지 포인트
  nextFocus: string[];   // 3가지 포인트
  metrics: InsightMetrics;
  source: "ai" | "rule";
}

export interface UnifiedInsightResponse {
  weekly: UnifiedInsightSnapshot | null;
  monthly: UnifiedInsightSnapshot | null;
}

/* ── AI 응답 파싱용 타입 ── */
export interface AiInsightText {
  wentWell: string[];    // 3가지 포인트
  toImprove: string[];   // 3가지 포인트
  nextFocus: string[];   // 3가지 포인트
}

/* ── 스마트 규칙 기반 폴백 ── */

export interface EnrichedFallbackInput {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  metrics: InsightMetrics;
  habitDetails: { name: string; rate: number }[]; // 습관별 달성률
  numericTargets: { name: string; current: number; target: number; unit: string }[];
  activeMilestones: { title: string; pillar: Pillar }[]; // 진행중 마일스톤
  sixMonthMilestones: { title: string; pillar: Pillar; status: string }[]; // 6개월 마일스톤
  monthlyGoals: { text: string; pillar: Pillar; completed: boolean }[];
  journals: {
    date: string;
    went_well?: string;
    to_improve?: string;
    accomplishments?: string;
  }[];
}

function buildWentWell(input: EnrichedFallbackInput): string[] {
  const { metrics, habitDetails, journals, monthlyGoals } = input;
  const points: string[] = [];

  // 저널의 잘한 일 종합
  const wentWellEntries = journals
    .map((j) => j.went_well?.trim())
    .filter(Boolean);
  if (wentWellEntries.length > 0) {
    points.push(`일지에 기록한 잘한 일들: ${wentWellEntries.slice(0, 3).join(", ")}`);
  }

  // 잘 지킨 습관
  const good = habitDetails.filter((h) => h.rate >= 70);
  if (good.length > 0) {
    const names = good
      .slice(0, 3)
      .map((h) => `${h.name}(${h.rate}%)`)
      .join(", ");
    points.push(`${names} 습관을 꾸준히 실행했습니다.`);
  }

  // 월간 목표 달성
  const completedGoals = monthlyGoals.filter((g) => g.completed);
  if (completedGoals.length > 0) {
    points.push(`이달 목표 중 '${completedGoals.map((g) => g.text).join("', '")}' 달성 완료!`);
  }

  // 추세 상승
  if (metrics.habitTrend > 0) {
    points.push(`습관 달성률이 전 기간 대비 ${metrics.habitTrend}%p 상승했습니다.`);
  }

  if (points.length === 0) {
    return [
      "아직 충분한 기록이 없습니다. 매일 잘한 일을 기록해보세요.",
      `현재 습관 달성률 ${metrics.habitCompletionRate}%입니다.`,
      "꾸준한 기록이 쌓이면 더 구체적인 피드백을 받을 수 있습니다.",
    ];
  }

  // 3개 포인트로 맞추기
  while (points.length < 3) {
    points.push("더 많은 기록이 쌓이면 추가 분석이 가능합니다.");
  }
  return points.slice(0, 3);
}

function buildToImprove(input: EnrichedFallbackInput): string[] {
  const { metrics, habitDetails, journals, monthlyGoals } = input;
  const points: string[] = [];

  // 저널의 보완할 점 종합
  const toImproveEntries = journals
    .map((j) => j.to_improve?.trim())
    .filter(Boolean);
  if (toImproveEntries.length > 0) {
    points.push(`일지에 기록한 보완점들: ${toImproveEntries.slice(0, 3).join(", ")}`);
  }

  // 가장 못 지킨 습관
  const weak = habitDetails.filter((h) => h.rate < 50);
  if (weak.length > 0) {
    const worst = weak.sort((a, b) => a.rate - b.rate)[0];
    points.push(`${worst.name} 달성률이 ${worst.rate}%로 낮습니다. 시간대를 고정하거나 난이도를 낮춰보세요.`);
  }

  // 미달성 월간 목표
  const incompleteGoals = monthlyGoals.filter((g) => !g.completed);
  if (incompleteGoals.length > 0) {
    points.push(`이달 미달성 목표: '${incompleteGoals.slice(0, 2).map((g) => g.text).join("', '")}'`);
  }

  // 추세 하락
  if (metrics.habitTrend < -5) {
    points.push(`습관 달성률이 전 기간 대비 ${Math.abs(metrics.habitTrend)}%p 하락했습니다.`);
  }

  if (points.length === 0) {
    return [
      "현재 데이터가 충분하지 않습니다.",
      "매일 보완하고 싶은 점을 기록해보세요.",
      "꾸준한 기록이 쌓이면 더 구체적인 피드백을 받을 수 있습니다.",
    ];
  }

  while (points.length < 3) {
    points.push("더 많은 기록이 쌓이면 추가 분석이 가능합니다.");
  }
  return points.slice(0, 3);
}

function buildNextFocus(input: EnrichedFallbackInput): string[] {
  const { sixMonthMilestones, metrics, numericTargets, monthlyGoals } = input;
  const points: string[] = [];

  const pillarLabel = (p: Pillar) =>
    p === "career" ? "일" : p === "identity" ? "나다운나" : "자산";

  // 6개월 마일스톤 기반 포커스
  const inProgressMilestones = sixMonthMilestones.filter(
    (m) => m.status === "in_progress" || m.status === "not_started",
  );
  if (inProgressMilestones.length > 0) {
    const m = inProgressMilestones[0];
    points.push(`'${m.title}' 마일스톤(${pillarLabel(m.pillar)})에 집중하여 관련 행동을 실천해보세요.`);
  }

  // 수치 목표 중 진행률이 낮은 것
  const lowTargets = numericTargets.filter(
    (t) => t.target > 0 && t.current / t.target < 0.3,
  );
  if (lowTargets.length > 0) {
    const t = lowTargets[0];
    const pct = Math.round((t.current / t.target) * 100);
    points.push(`${t.name} 진행률이 ${pct}%입니다. 이번 주 집중 과제로 설정해보세요.`);
  }

  // 미달성 월간 목표에서 행동 제안
  const incompleteGoals = monthlyGoals.filter((g) => !g.completed);
  if (incompleteGoals.length > 0) {
    const g = incompleteGoals[0];
    points.push(`'${g.text}' 목표(${pillarLabel(g.pillar)})를 위한 구체적 행동을 계획해보세요.`);
  }

  // 습관/할일 기반 보완
  if (metrics.habitCompletionRate < 60) {
    points.push("핵심 습관 1~2개를 고정 시간에 먼저 완료해 루틴을 안정화해보세요.");
  }
  if (metrics.todoCompletionRate < 60) {
    points.push("할 일을 3개 이내로 압축하고 우선순위 1번부터 마감 시간을 정해 실행해보세요.");
  }

  if (points.length === 0) {
    return [
      "현재 흐름을 유지하면서, 다음 핵심 마일스톤으로 에너지를 연결해보세요.",
      "새로운 월간 목표를 설정하여 방향성을 잡아보세요.",
      "일/나다운나/자산 3개 축의 균형을 점검해보세요.",
    ];
  }

  while (points.length < 3) {
    points.push("현재 흐름을 유지하면서 장기 목표와의 연결점을 찾아보세요.");
  }
  return points.slice(0, 3);
}

export function buildUnifiedFallback(
  input: EnrichedFallbackInput,
): UnifiedInsightSnapshot {
  return {
    period: input.period,
    dateRange: input.dateRange,
    wentWell: buildWentWell(input),
    toImprove: buildToImprove(input),
    nextFocus: buildNextFocus(input),
    metrics: input.metrics,
    source: "rule",
  };
}
