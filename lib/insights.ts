import type { Milestone, NumericLog, NumericTarget, DailyJournal, DailyTodo } from "@/lib/types";

export type InsightStatus = "ok" | "insufficient_data";

export interface InsightInput {
  milestones: Milestone[];
  targets: NumericTarget[];
  logs: NumericLog[];
  topicCount: number;
  journals: DailyJournal[];
  todos: DailyTodo[];
}

export interface InsightAction {
  title: string;
  difficulty: "low" | "medium" | "high";
  expectedImpact: "low" | "medium" | "high";
}

export interface InsightPayload {
  status: InsightStatus;
  summary: string;
  causes: string[];
  actions: InsightAction[];
  risks: string[];
  evidence: string[];
  confidence: "low" | "medium" | "high";
  followUpQuestions: string[];
}

export function buildFallbackInsight(input: InsightInput): InsightPayload {
  const completed = input.milestones.filter((m) => m.status === "completed").length;
  const inProgress = input.milestones.filter((m) => m.status === "in_progress").length;
  const total = input.milestones.length;

  const today = new Date();
  const recentLogs = input.logs.filter((l) => {
    const d = new Date(l.date);
    const diff = (today.getTime() - d.getTime()) / 86400000;
    return diff <= 14;
  });

  const hasJournalSignal = input.journals.some(
    (j) => j.accomplishments.trim() || j.to_improve.trim() || j.went_well.trim(),
  );
  const hasTodoSignal = input.todos.length > 0;
  const hasNumericSignal = input.targets.length > 0 && recentLogs.length > 0;

  const missing: string[] = [];
  if (!hasJournalSignal) missing.push("주간 회고(한 일/보완점/잘한 일)");
  if (!hasTodoSignal) missing.push("최근 할 일 실행 기록");
  if (!hasNumericSignal) missing.push("최근 14일 수치 로그");

  if (missing.length >= 2) {
    return {
      status: "insufficient_data",
      summary: "현재 데이터만으로는 원인-행동 연결형 결론의 신뢰도가 낮습니다.",
      causes: ["행동 로그/정성 회고/수치 로그 중 2개 이상이 비어 있습니다."],
      actions: [],
      risks: ["근거 부족 상태에서 결론을 만들면 실행 우선순위가 왜곡될 수 있습니다."],
      evidence: [
        `마일스톤 완료 ${completed}/${total}`,
        `최근 14일 수치 로그 ${recentLogs.length}건`,
        `대화소재 ${input.topicCount}개`,
      ],
      confidence: "low",
      followUpQuestions: missing.map((m) => `${m}를 채워주세요.`),
    };
  }

  const progressRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    status: "ok",
    summary:
      progressRate >= 60
        ? "이정표 이행이 안정적이며, 이제 병목(반복 미완료 항목) 제거에 집중하면 성과가 커질 구간입니다."
        : "핵심 목표는 설정되어 있으나 실행 데이터가 분산되어 있어, 주간 핵심 행동 3개로 압축하는 것이 우선입니다.",
    causes: [
      `완료 ${completed}개/진행중 ${inProgress}개로, 다수 목표가 동시 진행되어 집중도가 분산될 가능성이 있습니다.`,
      `최근 14일 수치 로그 ${recentLogs.length}건으로 측정 빈도가 일정하지 않으면 개선 판단이 어려워집니다.`,
    ],
    actions: [
      {
        title: "이번 주 최우선 목표 1개만 지정하고, 관련 행동 3개를 Todo 상단에 고정",
        difficulty: "low",
        expectedImpact: "high",
      },
      {
        title: "수치 목표별로 주 2회 이상 로그 입력(화/금 고정)",
        difficulty: "medium",
        expectedImpact: "medium",
      },
      {
        title: "주말 회고에서 방해요인 1개와 대응전략 1개를 반드시 기록",
        difficulty: "low",
        expectedImpact: "medium",
      },
    ],
    risks: [
      "목표를 동시에 많이 잡으면 완료율이 낮아지는 착시가 발생할 수 있습니다.",
      "수치 기록 간격이 길면 개선/악화의 원인을 잘못 해석할 수 있습니다.",
    ],
    evidence: [
      `마일스톤 완료율 ${progressRate}% (${completed}/${total})`,
      `최근 14일 수치 로그 ${recentLogs.length}건`,
      `대화소재 누적 ${input.topicCount}개`,
    ],
    confidence: hasJournalSignal && hasNumericSignal ? "medium" : "low",
    followUpQuestions: [
      "이번 주 가장 중요한 목표 1개는 무엇인가요?",
      "최근 가장 큰 방해요인은 무엇이었고 다음 주 대응은 무엇인가요?",
    ],
  };
}
