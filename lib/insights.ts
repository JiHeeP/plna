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
  wentWell: string;
  toImprove: string;
  nextFocus: string;
  metrics: InsightMetrics;
  source: "ai" | "rule";
}

export interface UnifiedInsightResponse {
  weekly: UnifiedInsightSnapshot | null;
  monthly: UnifiedInsightSnapshot | null;
}

/* ── AI 응답 파싱용 타입 ── */
export interface AiInsightText {
  wentWell: string;
  toImprove: string;
  nextFocus: string;
}

/* ── 스마트 규칙 기반 폴백 ── */

export interface EnrichedFallbackInput {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  metrics: InsightMetrics;
  habitDetails: { name: string; rate: number }[]; // 습관별 달성률
  numericTargets: { name: string; current: number; target: number; unit: string }[];
  activeMilestones: { title: string; pillar: Pillar }[]; // 진행중 마일스톤
  latestJournal?: {
    accomplishments?: string;
    went_well?: string;
    to_improve?: string;
  } | null;
}

function buildWentWell(input: EnrichedFallbackInput): string {
  const { metrics, habitDetails } = input;
  const parts: string[] = [];

  // 잘 지킨 습관 언급
  const good = habitDetails.filter((h) => h.rate >= 80);
  if (good.length > 0) {
    const names = good
      .slice(0, 3)
      .map((h) => `${h.name}(${h.rate}%)`)
      .join(", ");
    parts.push(`${names} 습관을 꾸준히 실행했습니다.`);
  }

  // 추세 상승
  if (metrics.habitTrend > 0) {
    parts.push(
      `습관 달성률이 전 기간 대비 ${metrics.habitTrend}%p 상승했습니다.`,
    );
  }
  if (metrics.todoTrend > 0) {
    parts.push(
      `할 일 달성률이 전 기간 대비 ${metrics.todoTrend}%p 올랐습니다.`,
    );
  }

  // 저널 기록이 있으면 참고
  if (input.latestJournal?.went_well?.trim()) {
    parts.push(input.latestJournal.went_well.trim());
  }

  if (parts.length === 0) {
    if (metrics.habitCompletionRate >= 50) {
      return `습관 달성률 ${metrics.habitCompletionRate}%로 절반 이상 유지하고 있습니다.`;
    }
    return "아직 충분한 기록이 없습니다. 매일 습관과 할 일을 기록해보세요.";
  }

  return parts.slice(0, 3).join(" ");
}

function buildToImprove(input: EnrichedFallbackInput): string {
  const { metrics, habitDetails } = input;
  const parts: string[] = [];

  // 가장 못 지킨 습관
  const weak = habitDetails.filter((h) => h.rate < 50);
  if (weak.length > 0) {
    const worst = weak.sort((a, b) => a.rate - b.rate)[0];
    parts.push(
      `${worst.name} 달성률이 ${worst.rate}%로 낮습니다. 시간대를 고정하거나 난이도를 낮춰보세요.`,
    );
  }

  // 추세 하락
  if (metrics.habitTrend < -5) {
    parts.push(
      `습관 달성률이 전 기간 대비 ${Math.abs(metrics.habitTrend)}%p 하락했습니다. 핵심 습관 1-2개에 먼저 집중해보세요.`,
    );
  }

  if (metrics.todoCompletionRate < 50 && metrics.todoCompletionRate > 0) {
    parts.push(
      `할 일 달성률이 ${metrics.todoCompletionRate}%입니다. 하루 할 일을 3개 이내로 줄이고 우선순위를 정해보세요.`,
    );
  }

  // 저널 기록
  if (input.latestJournal?.to_improve?.trim()) {
    parts.push(input.latestJournal.to_improve.trim());
  }

  if (parts.length === 0) {
    return "현재 데이터가 충분하지 않습니다. 매일 기록을 남기면 더 구체적인 피드백을 받을 수 있습니다.";
  }

  return parts.slice(0, 2).join(" ");
}

function buildNextFocus(input: EnrichedFallbackInput): string {
  const { activeMilestones, metrics, numericTargets, period } = input;

  // 월간: 전략적 관점 — 마일스톤 연결
  if (period === "monthly" && activeMilestones.length > 0) {
    const m = activeMilestones[0];
    const pillarLabel =
      m.pillar === "career" ? "일" : m.pillar === "identity" ? "나다운나" : "자산";
    return `'${m.title}' 마일스톤이 진행중입니다. ${pillarLabel} 축의 관련 습관과 할 일에 집중해보세요.`;
  }

  // 수치 목표 중 진행률이 낮은 것
  const lowTargets = numericTargets.filter(
    (t) => t.target > 0 && t.current / t.target < 0.3,
  );
  if (lowTargets.length > 0) {
    const t = lowTargets[0];
    const pct = Math.round((t.current / t.target) * 100);
    return `${t.name} 진행률이 ${pct}%(${t.current}/${t.target}${t.unit})입니다. 이번 주 집중 과제로 설정해보세요.`;
  }

  // 습관 기반
  if (metrics.habitCompletionRate < 60) {
    return "핵심 습관 1~2개를 고정 시간에 먼저 완료해 루틴을 안정화해보세요.";
  }
  if (metrics.todoCompletionRate < 60) {
    return "할 일을 3개 이내로 압축하고 우선순위 1번부터 마감 시간을 정해 실행해보세요.";
  }

  return "현재 흐름을 유지하면서, 다음 핵심 마일스톤으로 에너지를 연결해보세요.";
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
