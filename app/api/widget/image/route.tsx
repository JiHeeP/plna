import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";

import {
  authorizeWidgetRequest,
  getWidgetPayload,
  resolveWidgetDate,
  widgetCacheControl,
} from "@/lib/widget-data";
import { loadKoreanFont } from "@/lib/widget-font";
import { describeNextUp, type WidgetSummary } from "@/lib/widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_WIDTH = 800;
const BASE_HEIGHT = 400;

const PILLAR_HEX: Record<string, string> = {
  career: "#3b82f6",
  identity: "#10b981",
  assets: "#f59e0b",
};

type Theme = {
  card: string;
  text: string;
  muted: string;
  track: string;
  accent: string;
  divider: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    card: "#ffffff",
    text: "#0a0a0a",
    muted: "#71717a",
    track: "#e4e4e7",
    accent: "#2563eb",
    divider: "#ededf0",
  },
  dark: {
    card: "#131316",
    text: "#fafafa",
    muted: "#a1a1aa",
    track: "#2a2a30",
    accent: "#60a5fa",
    divider: "#26262c",
  },
};

/** 쿼리 파라미터가 없거나 숫자가 아니면 기본값을 쓴다. `Number(null)`이 0이 되는 함정을 피한다. */
function clampNumber(raw: string | null, min: number, max: number, fallback: number) {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 이미지에 실제로 그려지는 문자열 전부. 폰트 서브셋 요청에 쓴다. */
function collectText(summary: WidgetSummary, lines: string[]) {
  return [
    summary.label,
    summary.weekday,
    summary.affirmation,
    summary.weeklyGoal?.text ?? "",
    ...summary.habits.remaining,
    ...lines,
    "습관 남은 할 일 이번 주 오늘 완료 D+0123456789%()·개 ",
  ].join("");
}

export async function GET(request: NextRequest) {
  const auth = authorizeWidgetRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const date = resolveWidgetDate(params.get("date"));
  const width = clampNumber(params.get("w"), 320, 1600, BASE_WIDTH);
  const height = clampNumber(params.get("h"), 160, 1600, BASE_HEIGHT);
  const theme = THEMES[params.get("theme") === "dark" ? "dark" : "light"];

  const { payload, cacheStatus } = await getWidgetPayload(date);
  const summary = payload.summary;

  // 800x400을 기준 삼아 요청된 크기에 맞춰 전체 치수를 비례 확대/축소한다.
  const scale = width / BASE_WIDTH;
  const px = (value: number) => Math.round(value * scale);

  // 할 일이 남아 있으면 할 일을, 다 끝냈으면 남은 습관을 보여준다.
  // 확언은 항상 하단에만 두어 같은 문장이 두 번 나오지 않게 한다.
  const { heading: todoHeading, lines: todoLines } = describeNextUp(summary);

  const [regular, bold] = await Promise.all([
    loadKoreanFont(400, collectText(summary, [todoHeading, ...todoLines])),
    loadKoreanFont(700, collectText(summary, [todoHeading, ...todoLines])),
  ]);

  const fonts = [
    regular ? { name: "Noto Sans KR", data: regular, weight: 400 as const, style: "normal" as const } : null,
    bold ? { name: "Noto Sans KR", data: bold, weight: 700 as const, style: "normal" as const } : null,
  ].filter((font) => font !== null);

  const goalColor = summary.weeklyGoal ? PILLAR_HEX[summary.weeklyGoal.pillar] ?? theme.accent : theme.accent;

  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "transparent",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: px(28),
            borderRadius: px(28),
            backgroundColor: theme.card,
            color: theme.text,
            fontFamily: "Noto Sans KR",
          }}
        >
          {/* 날짜 헤더 */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: px(30), fontWeight: 700 }}>
              {summary.label} ({summary.weekday})
            </div>
            <div style={{ display: "flex", fontSize: px(22), color: theme.muted }}>
              D+{summary.dDay}
            </div>
          </div>

          {/* 습관 진행률 */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: px(20) }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <div style={{ display: "flex", fontSize: px(21), color: theme.muted }}>습관</div>
                <div style={{ display: "flex", fontSize: px(42), fontWeight: 700, marginLeft: px(12) }}>
                  {summary.habits.done}/{summary.habits.total}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: px(26), fontWeight: 700, color: theme.accent }}>
                {summary.habits.percent}%
              </div>
            </div>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: px(14),
                marginTop: px(10),
                borderRadius: px(7),
                backgroundColor: theme.track,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: `${summary.habits.percent}%`,
                  height: "100%",
                  borderRadius: px(7),
                  backgroundColor: theme.accent,
                }}
              />
            </div>
          </div>

          {/* 남은 할 일 */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: px(20) }}>
            <div style={{ display: "flex", fontSize: px(21), color: theme.muted }}>{todoHeading}</div>
            {todoLines.map((line, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: px(8),
                  fontSize: px(24),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: px(7),
                    height: px(7),
                    borderRadius: px(4),
                    marginRight: px(10),
                    backgroundColor: theme.muted,
                  }}
                />
                <div style={{ display: "flex" }}>{line}</div>
              </div>
            ))}
          </div>

          {/* 이번 주 목표 */}
          <div style={{ display: "flex", flexGrow: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingTop: px(14),
              borderTop: `${Math.max(1, px(1))}px solid ${theme.divider}`,
            }}
          >
            <div
              style={{
                display: "flex",
                width: px(9),
                height: px(9),
                borderRadius: px(5),
                marginRight: px(10),
                backgroundColor: goalColor,
              }}
            />
            <div style={{ display: "flex", fontSize: px(21), color: theme.muted }}>
              {summary.weeklyGoal ? `이번 주 · ${summary.weeklyGoal.text}` : summary.affirmation}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );

  const response = new NextResponse(image.body, {
    status: image.status,
    headers: image.headers,
  });
  response.headers.set("Content-Type", "image/png");
  response.headers.set("x-plna-widget-cache", cacheStatus);
  response.headers.set("Cache-Control", widgetCacheControl(auth.via));
  return response;
}
