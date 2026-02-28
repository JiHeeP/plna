import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildUnifiedFallback,
  type AiInsightText,
  type InsightMetrics,
  type UnifiedInsightSnapshot,
  type UnifiedInsightResponse,
  type Pillar,
  type PillarMilestoneStats,
  type EnrichedFallbackInput,
} from "@/lib/insights";

/* ── 날짜 유틸 ── */

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { start: toDateString(start), end: toDateString(end) };
}

/* ── LLM 설정 (Kimi 2.5 기본) ── */

function getLlmConfig() {
  return {
    apiKey: process.env.KIMI_API_KEY ?? null,
    baseUrl: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
    model: process.env.KIMI_MODEL ?? "kimi-k2-0711-preview",
  };
}

/* ── 전체 데이터 수집 (풍부한 컨텍스트) ── */

interface HabitDetail {
  name: string;
  completed: number;
  total: number;
  rate: number;
}

interface NumericTargetProgress {
  name: string;
  unit: string;
  target: number;
  current: number;
  pillar: Pillar;
}

interface MilestoneInfo {
  title: string;
  pillar: Pillar;
  timeframe: string;
  status: string;
}

interface MonthlyGoalInfo {
  text: string;
  pillar: Pillar;
  completed: boolean;
}

interface CollectedData {
  metrics: InsightMetrics;
  habitDetails: HabitDetail[];
  numericTargets: NumericTargetProgress[];
  milestones: MilestoneInfo[];
  activeMilestones: { title: string; pillar: Pillar }[];
  monthlyGoals: MonthlyGoalInfo[];
  journals: {
    date: string;
    accomplishments: string;
    went_well: string;
    to_improve: string;
  }[];
  hasAnyData: boolean;
}

async function collectAllData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  days: number,
  dateRange: { start: string; end: string },
): Promise<CollectedData> {
  // 이전 기간 범위 (추세 계산용)
  const prevEnd = new Date(dateRange.start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  const prevRange = {
    start: toDateString(prevStart),
    end: toDateString(prevEnd),
  };

  const currentMonth = getCurrentMonth();

  // 병렬로 모든 데이터 수집
  const [
    { data: journals },
    { data: habits },
    { data: habitLogs },
    { data: prevHabitLogs },
    { data: todos },
    { data: prevTodos },
    { data: milestones },
    { data: targets },
    { data: numericLogs },
    { data: monthlyGoals },
  ] = await Promise.all([
    // 저널 (기간 내 전체)
    supabase
      .from("daily_journals")
      .select("date, accomplishments, went_well, to_improve")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .order("date", { ascending: false }),
    // 활성 습관 (이름 포함)
    supabase
      .from("daily_habits")
      .select("id, name")
      .eq("is_active", true),
    // 현재 기간 습관 로그 (habit_id 포함)
    supabase
      .from("habit_logs")
      .select("habit_id, completed")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .eq("completed", true),
    // 이전 기간 습관 로그 (추세용)
    supabase
      .from("habit_logs")
      .select("id")
      .gte("date", prevRange.start)
      .lte("date", prevRange.end)
      .eq("completed", true),
    // 현재 기간 할 일
    supabase
      .from("daily_todos")
      .select("id, completed")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end),
    // 이전 기간 할 일 (추세용)
    supabase
      .from("daily_todos")
      .select("id, completed")
      .gte("date", prevRange.start)
      .lte("date", prevRange.end),
    // 마일스톤 전체
    supabase
      .from("milestones")
      .select("title, pillar, timeframe, status"),
    // 수치 목표
    supabase
      .from("numeric_targets")
      .select("id, name, unit, target_value, pillar"),
    // 수치 로그 (최신값만 필요)
    supabase
      .from("numeric_logs")
      .select("target_id, value")
      .order("date", { ascending: false }),
    // 이번 달 월간 목표
    supabase
      .from("monthly_goals")
      .select("text, pillar, completed")
      .eq("month", currentMonth),
  ]);

  const habitList = habits ?? [];
  const habitLogList = habitLogs ?? [];
  const todoList = todos ?? [];
  const prevHabitLogList = prevHabitLogs ?? [];
  const prevTodoList = prevTodos ?? [];
  const milestoneList = (milestones ?? []) as MilestoneInfo[];
  const targetList = targets ?? [];
  const logList = numericLogs ?? [];
  const journalList = (journals ?? []) as CollectedData["journals"];
  const monthlyGoalList = (monthlyGoals ?? []) as MonthlyGoalInfo[];

  // ── 습관별 상세 계산 ──
  const habitDetails: HabitDetail[] = habitList.map((h) => {
    const completed = habitLogList.filter(
      (l) => l.habit_id === h.id,
    ).length;
    return {
      name: h.name,
      completed,
      total: days,
      rate: days > 0 ? Math.round((completed / days) * 100) : 0,
    };
  });

  // ── 전체 습관/할일 달성률 ──
  const habitTotal = habitList.length * days;
  const habitCompleted = habitLogList.length;
  const todoTotal = todoList.length;
  const todoCompleted = todoList.filter((t) => t.completed).length;

  const habitRate =
    habitTotal > 0 ? Math.round((habitCompleted / habitTotal) * 100) : 0;
  const todoRate =
    todoTotal > 0 ? Math.round((todoCompleted / todoTotal) * 100) : 0;

  // ── 이전 기간 달성률 (추세 계산) ──
  const prevHabitTotal = habitList.length * days;
  const prevHabitCompleted = prevHabitLogList.length;
  const prevTodoTotal = prevTodoList.length;
  const prevTodoCompleted = prevTodoList.filter((t) => t.completed).length;

  const prevHabitRate =
    prevHabitTotal > 0
      ? Math.round((prevHabitCompleted / prevHabitTotal) * 100)
      : 0;
  const prevTodoRate =
    prevTodoTotal > 0
      ? Math.round((prevTodoCompleted / prevTodoTotal) * 100)
      : 0;

  // ── 마일스톤 진행률 (pillar별) ──
  const pillars: Pillar[] = ["career", "identity", "assets"];
  const milestoneProgress = {} as Record<Pillar, PillarMilestoneStats>;
  for (const p of pillars) {
    const pm = milestoneList.filter((m) => m.pillar === p);
    milestoneProgress[p] = {
      total: pm.length,
      inProgress: pm.filter((m) => m.status === "in_progress").length,
      completed: pm.filter((m) => m.status === "completed").length,
    };
  }

  // ── 수치 목표 진행률 ──
  const numericTargets: NumericTargetProgress[] = targetList.map((t) => {
    const latestLog = logList.find((l) => l.target_id === t.id);
    return {
      name: t.name,
      unit: t.unit,
      target: Number(t.target_value),
      current: latestLog ? Number(latestLog.value) : 0,
      pillar: t.pillar as Pillar,
    };
  });

  // ── top/bottom 습관 ──
  const sorted = [...habitDetails].sort((a, b) => b.rate - a.rate);
  const topHabits = sorted
    .filter((h) => h.rate >= 70)
    .slice(0, 3)
    .map((h) => h.name);
  const bottomHabits = sorted
    .filter((h) => h.rate < 50)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)
    .map((h) => h.name);

  const activeMilestones = milestoneList
    .filter((m) => m.status === "in_progress")
    .map((m) => ({ title: m.title, pillar: m.pillar as Pillar }));

  const hasAnyData =
    journalList.length > 0 || habitCompleted > 0 || todoTotal > 0;

  return {
    metrics: {
      habitCompletionRate: habitRate,
      todoCompletionRate: todoRate,
      habitTrend: habitRate - prevHabitRate,
      todoTrend: todoRate - prevTodoRate,
      milestoneProgress,
      topHabits,
      bottomHabits,
    },
    habitDetails,
    numericTargets,
    milestones: milestoneList,
    activeMilestones,
    monthlyGoals: monthlyGoalList,
    journals: journalList,
    hasAnyData,
  };
}

/* ── AI 컨텍스트 조립 ── */

function buildAiContext(
  data: CollectedData,
  period: "weekly" | "monthly",
  prevRateLabel: string,
): string {
  const { metrics, habitDetails, numericTargets, milestones, monthlyGoals } = data;

  // 습관별 상세
  const habitLines = habitDetails
    .map((h) => `  - ${h.name}: ${h.completed}/${h.total}일 (${h.rate}%)`)
    .join("\n");

  // 마일스톤 현황 (pillar별)
  const pillarLabels: Record<Pillar, string> = {
    career: "일(career)",
    identity: "나다운나(identity)",
    assets: "자산(assets)",
  };

  // 6개월 마일스톤 상세
  const sixMonthMilestones = milestones.filter((m) => m.timeframe === "6month");
  const sixMonthLines = sixMonthMilestones.length > 0
    ? sixMonthMilestones
        .map((m) => `  - [${m.status === "completed" ? "완료" : m.status === "in_progress" ? "진행중" : "미시작"}] ${m.title} (${pillarLabels[m.pillar]})`)
        .join("\n")
    : "  - 6개월 마일스톤 없음";

  const milestoneLines = (["career", "identity", "assets"] as Pillar[])
    .map((p) => {
      const s = metrics.milestoneProgress[p];
      const inProgress = milestones
        .filter((m) => m.pillar === p && m.status === "in_progress")
        .map((m) => `'${m.title}'`)
        .join(", ");
      return `  - ${pillarLabels[p]}: ${s.completed}완료 / ${s.inProgress}진행중 / ${s.total}개 총${inProgress ? ` (진행중: ${inProgress})` : ""}`;
    })
    .join("\n");

  // 수치 목표
  const targetLines =
    numericTargets.length > 0
      ? numericTargets
          .map((t) => {
            const pct =
              t.target > 0 ? Math.round((t.current / t.target) * 100) : 0;
            return `  - ${t.name}: ${t.current}/${t.target}${t.unit} (${pct}%)`;
          })
          .join("\n")
      : "  - 설정된 수치 목표 없음";

  // 월간 목표
  const monthlyGoalLines = monthlyGoals.length > 0
    ? monthlyGoals
        .map((g) => `  - [${g.completed ? "달성" : "미달성"}] ${g.text} (${pillarLabels[g.pillar]})`)
        .join("\n")
    : "  - 설정된 월간 목표 없음";

  // 저널 전체 (잘한 일 / 보완할 점 분리)
  const journalWentWellLines = data.journals
    .filter((j) => j.went_well?.trim())
    .map((j) => `  - ${j.date}: ${j.went_well.trim()}`)
    .join("\n") || "  - 기록 없음";

  const journalToImproveLines = data.journals
    .filter((j) => j.to_improve?.trim())
    .map((j) => `  - ${j.date}: ${j.to_improve.trim()}`)
    .join("\n") || "  - 기록 없음";

  const journalAccomplishmentLines = data.journals
    .filter((j) => j.accomplishments?.trim())
    .map((j) => `  - ${j.date}: ${j.accomplishments.trim()}`)
    .join("\n") || "  - 기록 없음";

  // 추세
  const habitTrendLabel =
    metrics.habitTrend > 0
      ? `+${metrics.habitTrend}%p 상승`
      : metrics.habitTrend < 0
        ? `${metrics.habitTrend}%p 하락`
        : "변동 없음";
  const todoTrendLabel =
    metrics.todoTrend > 0
      ? `+${metrics.todoTrend}%p 상승`
      : metrics.todoTrend < 0
        ? `${metrics.todoTrend}%p 하락`
        : "변동 없음";

  return `[사용자 장기 목표]
3대 축: 일(career), 나다운나(identity), 자산(assets)

마일스톤 전체 현황:
${milestoneLines}

6개월 마일스톤 상세:
${sixMonthLines}

수치 목표 진행률:
${targetLines}

[이번 달 목표]
${monthlyGoalLines}

[이번 ${period === "weekly" ? "주" : "달"} 데이터]
습관 전체 달성률: ${metrics.habitCompletionRate}% (${prevRateLabel} → ${habitTrendLabel})
습관별 상세:
${habitLines}

할 일 달성률: ${metrics.todoCompletionRate}% (${prevRateLabel.replace("습관", "할일")} → ${todoTrendLabel})

[오늘의 기록 - 잘한 일]
${journalWentWellLines}

[오늘의 기록 - 보완하고 싶은 것]
${journalToImproveLines}

[오늘의 기록 - 성취/해낸 것]
${journalAccomplishmentLines}`;
}

/* ── AI 프롬프트 생성 ── */

function buildPrompt(
  period: "weekly" | "monthly",
  context: string,
): string {
  if (period === "weekly") {
    return `당신은 목표 실행 코치입니다. 아래 주간 데이터를 기반으로 구체적이고 실행 가능한 인사이트를 작성하세요.

${context}

중요: 각 항목은 반드시 3가지 포인트의 배열로 응답하세요.

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "wentWell": [
    "월~일까지의 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 1 (1-2문장)",
    "월~일까지의 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 2 (1-2문장)",
    "월~일까지의 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 3 (1-2문장)"
  ],
  "toImprove": [
    "월~일까지의 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 1 (1-2문장)",
    "월~일까지의 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 2 (1-2문장)",
    "월~일까지의 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 3 (1-2문장)"
  ],
  "nextFocus": [
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 1 (1-2문장)",
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 2 (1-2문장)",
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 3 (1-2문장)"
  ]
}

규칙:
- 한국어로 작성
- 각 필드는 반드시 3개 문자열의 배열
- wentWell: 주간 단위(월~일)로 '잘한 일' 저널 기록들 + 이번 달 목표를 종합 분석. 단순히 습관 달성률만 나열하거나 어제 보완점을 복붙하지 말 것. 최종적으로 어떤 점을 잘했는지 3가지 포인트
- toImprove: 주간 단위(월~일)로 '보완하고 싶은 것' 저널 기록들 + 이번 달 목표를 종합 분석. 단순히 저조한 습관만 나열하거나 어제 보완점을 복붙하지 말 것. 최종적으로 어떤 점을 보완해야 하는지 3가지 포인트
- nextFocus: 6개월 마일스톤을 혼합하여 어떤 지점에 좀 더 목표를 두고 실제 행동이 필요한지 3가지 포인트
- 실제 데이터에 근거한 분석만 (추측 금지)
- 격려하되 솔직한 톤`;
  }

  return `당신은 목표 실행 코치입니다. 아래 월간 데이터를 기반으로 전략적 리뷰를 작성하세요.

${context}

중요: 각 항목은 반드시 3가지 포인트의 배열로 응답하세요.

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "wentWell": [
    "이번 달 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 1 (1-2문장)",
    "이번 달 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 2 (1-2문장)",
    "이번 달 '잘한 일' 기록과 월간 목표를 종합하여 잘한 점 3 (1-2문장)"
  ],
  "toImprove": [
    "이번 달 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 1 (1-2문장)",
    "이번 달 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 2 (1-2문장)",
    "이번 달 '보완하고 싶은 것' 기록과 월간 목표를 종합하여 보완할 점 3 (1-2문장)"
  ],
  "nextFocus": [
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 1 (1-2문장)",
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 2 (1-2문장)",
    "6개월 마일스톤을 혼합하여 실제 행동이 필요한 포커스 3 (1-2문장)"
  ]
}

규칙:
- 한국어로 작성
- 각 필드는 반드시 3개 문자열의 배열
- wentWell: 이번 달 '잘한 일' 저널 기록들 + 월간 목표를 종합 분석. 최종적으로 어떤 점을 잘했는지 3가지 포인트
- toImprove: 이번 달 '보완하고 싶은 것' 저널 기록들 + 월간 목표를 종합 분석. 최종적으로 어떤 점을 보완해야 하는지 3가지 포인트
- nextFocus: 6개월 마일스톤을 혼합하여 어떤 지점에 좀 더 목표를 두고 실제 행동이 필요한지 3가지 포인트
- 데이터 기반 전략적 분석 (추측 금지)
- 장기 비전과 현재 진행 상황의 연결점 강조
- 코칭 톤`;
}

/* ── AI 텍스트 생성 ── */

async function generateAiText(
  period: "weekly" | "monthly",
  context: string,
): Promise<AiInsightText | null> {
  const config = getLlmConfig();
  if (!config.apiKey) {
    console.log("[Insights] KIMI_API_KEY not set — falling back to rule-based");
    return null;
  }

  const prompt = buildPrompt(period, context);

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "당신은 개인 목표 실행 코치입니다. 사용자의 습관, 할 일, 마일스톤, 월간 목표, 저널 데이터를 분석하여 실행 가능한 코칭 인사이트를 JSON으로만 답합니다. 각 필드(wentWell, toImprove, nextFocus)는 반드시 3개의 문자열로 이루어진 배열이어야 합니다.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`[Insights] LLM API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      console.error("[Insights] LLM returned empty content");
      return null;
    }

    const parsed = JSON.parse(content);

    // 배열 형식 검증 및 변환
    const toArray = (v: unknown): string[] | null => {
      if (Array.isArray(v) && v.length >= 1 && v.every((s) => typeof s === "string")) {
        // 3개로 맞추기
        const arr = v.slice(0, 3) as string[];
        while (arr.length < 3) arr.push("추가 분석이 필요합니다.");
        return arr;
      }
      if (typeof v === "string" && v.trim()) {
        return [v.trim(), "추가 분석이 필요합니다.", "추가 분석이 필요합니다."];
      }
      return null;
    };

    const wentWell = toArray(parsed.wentWell);
    const toImprove = toArray(parsed.toImprove);
    const nextFocus = toArray(parsed.nextFocus);

    if (!wentWell || !toImprove || !nextFocus) {
      console.error("[Insights] LLM response missing required fields");
      return null;
    }

    return { wentWell, toImprove, nextFocus };
  } catch (err) {
    console.error("[Insights] LLM call failed:", err);
    return null;
  }
}

/* ── 스냅샷 빌드 ── */

async function buildSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  period: "weekly" | "monthly",
  days: number,
): Promise<UnifiedInsightSnapshot | null> {
  const dateRange = getDateRange(days);
  const data = await collectAllData(supabase, days, dateRange);

  if (!data.hasAnyData) return null;

  // AI 컨텍스트 조립
  const prevLabel =
    period === "weekly" ? "지난주" : "지난달";
  const context = buildAiContext(data, period, prevLabel);

  // AI 생성 시도
  const aiText = await generateAiText(period, context);

  if (aiText) {
    return {
      period,
      dateRange,
      wentWell: aiText.wentWell,
      toImprove: aiText.toImprove,
      nextFocus: aiText.nextFocus,
      metrics: data.metrics,
      source: "ai",
    };
  }

  // 스마트 폴백
  const sixMonthMilestones = data.milestones
    .filter((m) => m.timeframe === "6month")
    .map((m) => ({ title: m.title, pillar: m.pillar as Pillar, status: m.status }));

  const fallbackInput: EnrichedFallbackInput = {
    period,
    dateRange,
    metrics: data.metrics,
    habitDetails: data.habitDetails.map((h) => ({
      name: h.name,
      rate: h.rate,
    })),
    numericTargets: data.numericTargets,
    activeMilestones: data.activeMilestones,
    sixMonthMilestones,
    monthlyGoals: data.monthlyGoals,
    journals: data.journals,
  };

  return buildUnifiedFallback(fallbackInput);
}

/* ── GET handler ── */

export async function GET() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json<UnifiedInsightResponse>({
      weekly: null,
      monthly: null,
    });
  }

  try {
    const supabase = await createClient();
    const [weekly, monthly] = await Promise.all([
      buildSnapshot(supabase, "weekly", 7),
      buildSnapshot(supabase, "monthly", 30),
    ]);

    return NextResponse.json<UnifiedInsightResponse>({ weekly, monthly });
  } catch (e) {
    console.error("Insights API error:", e);
    return NextResponse.json<UnifiedInsightResponse>(
      { weekly: null, monthly: null },
      { status: 500 },
    );
  }
}
