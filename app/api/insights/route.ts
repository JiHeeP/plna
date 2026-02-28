import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildUnifiedFallback,
  type AiInsightText,
  type InsightMetrics,
  type UnifiedInsightSnapshot,
  type UnifiedInsightResponse,
} from "@/lib/insights";

/* ── 날짜 유틸 ── */

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

/* ── 메트릭 계산 ── */

async function buildMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  days: number,
  dateRange: { start: string; end: string },
) {
  const [
    { data: journals },
    { data: habits },
    { data: habitLogs },
    { data: todos },
  ] = await Promise.all([
    supabase
      .from("daily_journals")
      .select("date, accomplishments, went_well, to_improve")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .order("date", { ascending: false }),
    supabase.from("daily_habits").select("id").eq("is_active", true),
    supabase
      .from("habit_logs")
      .select("id")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end)
      .eq("completed", true),
    supabase
      .from("daily_todos")
      .select("id, completed")
      .gte("date", dateRange.start)
      .lte("date", dateRange.end),
  ]);

  const habitTotal = (habits?.length || 0) * days;
  const habitCompleted = habitLogs?.length || 0;
  const todoTotal = todos?.length || 0;
  const todoCompleted = todos?.filter((t) => t.completed).length || 0;

  const hasAnyData = (journals?.length || 0) > 0 || habitCompleted > 0 || todoTotal > 0;

  const metrics: InsightMetrics = {
    habitCompletionRate: habitTotal > 0 ? Math.round((habitCompleted / habitTotal) * 100) : 0,
    todoCompletionRate: todoTotal > 0 ? Math.round((todoCompleted / todoTotal) * 100) : 0,
  };

  return { metrics, journals: journals ?? [], hasAnyData };
}

/* ── AI 텍스트 생성 ── */

async function generateAiText(
  periodLabel: string,
  metrics: InsightMetrics,
  journalSummaries: string[],
): Promise<AiInsightText | null> {
  const config = getLlmConfig();
  if (!config.apiKey) return null;

  const prompt = `당신은 목표 실행 코치입니다. 아래 ${periodLabel} 데이터를 분석해 사용자에게 도움이 되는 인사이트를 JSON으로만 반환하세요.

반드시 포함할 필드:
- wentWell (string): 잘한 점 요약 (1~2문장, 구체적으로)
- toImprove (string): 보완할 점 (1~2문장, 실행 가능한 제안 포함)
- nextFocus (string): 다음 기간 핵심 포커스 (1문장)

규칙:
- 근거 없는 추측 금지
- 데이터가 부족하면 있는 데이터만으로 분석
- 한국어로 작성

데이터:
- 습관 달성률: ${metrics.habitCompletionRate}%
- 할 일 달성률: ${metrics.todoCompletionRate}%
- 최근 저널 기록: ${journalSummaries.length > 0 ? journalSummaries.join(" | ") : "없음"}`;

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "실행 가능한 코칭 인사이트를 JSON으로만 답하세요." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content) as AiInsightText;
    if (!parsed.wentWell || !parsed.toImprove || !parsed.nextFocus) return null;
    return parsed;
  } catch {
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
  const { metrics, journals, hasAnyData } = await buildMetrics(supabase, days, dateRange);

  if (!hasAnyData) return null;

  const latestJournal = journals[0] ?? null;

  // 저널 요약 추출 (AI에 전달)
  const journalSummaries = journals
    .slice(0, 5)
    .map((j) => [j.went_well, j.to_improve, j.accomplishments].filter(Boolean).join(", "))
    .filter((s) => s.length > 0);

  const periodLabel = period === "weekly" ? "주간" : "월간";
  const aiText = await generateAiText(periodLabel, metrics, journalSummaries);

  if (aiText) {
    return {
      period,
      dateRange,
      wentWell: aiText.wentWell,
      toImprove: aiText.toImprove,
      nextFocus: aiText.nextFocus,
      metrics,
      source: "ai",
    };
  }

  return buildUnifiedFallback({ period, dateRange, metrics, latestJournal });
}

/* ── GET handler ── */

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json<UnifiedInsightResponse>({ weekly: null, monthly: null });
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
    return NextResponse.json<UnifiedInsightResponse>({ weekly: null, monthly: null }, { status: 500 });
  }
}
