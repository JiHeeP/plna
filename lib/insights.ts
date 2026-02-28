/* ─────────────────────────────────────────────
 *  Unified Insight types & rule-based fallback
 * ───────────────────────────────────────────── */

export interface InsightMetrics {
  habitCompletionRate: number;
  todoCompletionRate: number;
}

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

/* ── 규칙 기반 폴백 ── */

interface FallbackInput {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  metrics: InsightMetrics;
  latestJournal?: {
    accomplishments?: string;
    went_well?: string;
    to_improve?: string;
  } | null;
}

function getNextFocus(habitRate: number, todoRate: number): string {
  if (habitRate < 60 && habitRate <= todoRate) {
    return "핵심 습관 1~2개를 고정 시간에 먼저 완료해 루틴을 안정화해보세요.";
  }
  if (todoRate < 60 && todoRate < habitRate) {
    return "할 일을 3개 이내로 압축하고 우선순위 1번부터 마감 시간을 정해 실행해보세요.";
  }
  return "유지하고 있는 흐름을 이어가기 위해 지금의 페이스를 다음 핵심 과제로 연결해보세요.";
}

export function buildUnifiedFallback(input: FallbackInput): UnifiedInsightSnapshot {
  const { period, dateRange, metrics, latestJournal } = input;

  return {
    period,
    dateRange,
    wentWell:
      latestJournal?.went_well?.trim() ||
      latestJournal?.accomplishments?.trim() ||
      "아직 기록된 내용이 없습니다.",
    toImprove:
      latestJournal?.to_improve?.trim() ||
      "아직 기록된 내용이 없습니다.",
    nextFocus: getNextFocus(metrics.habitCompletionRate, metrics.todoCompletionRate),
    metrics,
    source: "rule",
  };
}
