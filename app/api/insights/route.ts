import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFallbackInsight, type InsightInput, type InsightPayload } from "@/lib/insights";

interface LlmConfig {
  apiKey: string | null;
  baseUrl: string;
  model: string;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLlmConfig(): LlmConfig {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();

  if (provider === "kimi") {
    return {
      apiKey: process.env.KIMI_API_KEY ?? null,
      baseUrl: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
      model: process.env.KIMI_MODEL ?? "kimi-k2-0711-preview",
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY ?? null,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  };
}

async function generateWithLlm(input: InsightInput): Promise<InsightPayload | null> {
  const config = getLlmConfig();
  if (!config.apiKey) return null;

  const prompt = `당신은 목표 실행 코치입니다. 아래 데이터로 실행 가능한 인사이트를 JSON으로만 반환하세요.

반드시 포함할 필드:
status("ok"), summary(string), causes(string[]), actions([{title,difficulty,expectedImpact}]), risks(string[]), evidence(string[]), confidence("low"|"medium"|"high"), followUpQuestions(string[])

규칙:
- 근거 없는 추측 금지
- evidence에는 실제 데이터 기반 수치/사실만 넣기
- actions는 3개만

데이터:
${JSON.stringify(input)}`;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "정확하고 실행 가능한 코칭 인사이트를 JSON으로만 답하세요." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;
  return safeJsonParse<InsightPayload>(content);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const [milestones, targets, logs, topics, journals, todos] = await Promise.all([
      supabase.from("milestones").select("*").order("timeframe").order("created_at", { ascending: true }),
      supabase.from("numeric_targets").select("*"),
      supabase.from("numeric_logs").select("*").order("date"),
      supabase.from("conversation_topics").select("id"),
      supabase.from("daily_journals").select("*").order("date", { ascending: false }).limit(14),
      supabase.from("daily_todos").select("*").order("date", { ascending: false }).limit(50),
    ]);

    const input: InsightInput = {
      milestones: milestones.data ?? [],
      targets: targets.data ?? [],
      logs: logs.data ?? [],
      topicCount: topics.data?.length ?? 0,
      journals: journals.data ?? [],
      todos: todos.data ?? [],
    };

    const aiInsight = await generateWithLlm(input);
    const insight = aiInsight ?? buildFallbackInsight(input);

    return NextResponse.json(insight);
  } catch (e) {
    console.error("Insights API error:", e);
    return NextResponse.json(
      {
        status: "insufficient_data",
        summary: "인사이트 생성 중 오류가 발생했습니다.",
        causes: ["서버에서 데이터 로딩 또는 모델 호출에 실패했습니다."],
        actions: [],
        risks: ["임시 오류로 인해 결론 신뢰도가 낮습니다."],
        evidence: [],
        confidence: "low",
        followUpQuestions: ["잠시 후 다시 시도해주세요."],
      },
      { status: 500 },
    );
  }
}
