import { NextResponse } from "next/server";
import { buildFallbackDigest, fetchLikedTweets } from "@/lib/x-likes";

interface LlmDigest {
  summary: string;
  bullets: string[];
}

function getLlmConfig() {
  return {
    apiKey: process.env.KIMI_API_KEY ?? null,
    baseUrl: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
    model: process.env.KIMI_MODEL ?? "kimi-k2-0711-preview",
  };
}

async function generateLlmDigest(input: string): Promise<LlmDigest | null> {
  const cfg = getLlmConfig();
  if (!cfg.apiKey) return null;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "너는 사용자의 X 좋아요 목록을 요약하는 비서다. 한국어로 간결하게 요약하라. JSON만 반환하라.",
          },
          {
            role: "user",
            content:
              `아래 좋아요 목록을 요약해줘.\n` +
              `반환 형식: {\"summary\": string, \"bullets\": string[5]}\n` +
              `bullets는 최대 5개, 핵심만.\n\n${input}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content) as Partial<LlmDigest>;
    if (!parsed.summary || !Array.isArray(parsed.bullets)) return null;

    const bullets = parsed.bullets
      .filter((x): x is string => typeof x === "string" && !!x.trim())
      .slice(0, 5);

    if (bullets.length === 0) return null;

    return {
      summary: parsed.summary,
      bullets,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");

    const tweets = await fetchLikedTweets(Number.isFinite(limit) ? limit : 20);

    const digestInput = tweets
      .map((t, i) => {
        const author = t.author_username ? `@${t.author_username}` : "unknown";
        return `${i + 1}) ${author} | ${t.created_at ?? "unknown"}\n${t.text}`;
      })
      .join("\n\n");

    const ai = await generateLlmDigest(digestInput);
    const fallback = buildFallbackDigest(tweets);

    return NextResponse.json({
      ok: true,
      count: tweets.length,
      summary: ai?.summary ?? fallback.summary,
      bullets: ai?.bullets ?? fallback.bullets,
      source: ai ? "ai" : "rule",
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
