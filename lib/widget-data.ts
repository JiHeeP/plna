import { timingSafeEqual } from "node:crypto";

import { createClient } from "@/lib/firebase/server";
import { getISOWeekString } from "@/lib/utils";
import {
  buildWidgetSummary,
  dateStringInTimeZone,
  parseDateString,
  resolveWidgetTimeZone,
  type WidgetSourceRows,
  type WidgetSummary,
} from "@/lib/widget";
import type { Pillar } from "@/lib/types";

export type WidgetWarning = { source: string; message: string };
export type WidgetCacheStatus = "hit" | "miss" | "quota-cooldown";

export interface WidgetPayload {
  summary: WidgetSummary;
  warnings: WidgetWarning[];
}

const DEFAULT_CACHE_TTL_SECONDS = 300;
const FIRESTORE_QUOTA_COOLDOWN_MS = 2 * 60 * 1000;

const widgetCache = new Map<string, { expiresAt: number; payload: WidgetPayload }>();
let firestoreQuotaCooldownUntil = 0;

/** 위젯 URL은 폰에 그대로 저장되므로, 앱 전체가 아니라 이 엔드포인트 전용 토큰으로 막는다. */
export function resolveWidgetToken() {
  const token = process.env.PLNA_WIDGET_TOKEN?.trim();
  return token ? token : null;
}

export function widgetCacheTtlSeconds() {
  const raw = Number(process.env.PLNA_WIDGET_CACHE_SECONDS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_CACHE_TTL_SECONDS;
  return Math.min(Math.floor(raw), 3600);
}

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type WidgetAuthResult =
  | { ok: true; via: "query" | "header" }
  | { ok: false; status: 401 | 503; message: string };

/**
 * `?token=` 와 `Authorization: Bearer` 를 모두 받는다.
 * 안드로이드 이미지 위젯 앱은 헤더를 못 붙이는 경우가 많아 쿼리 파라미터가 필요하다.
 */
export function authorizeWidgetRequest(request: Request): WidgetAuthResult {
  const expected = resolveWidgetToken();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      message: "PLNA_WIDGET_TOKEN이 설정되지 않아 위젯 엔드포인트가 비활성화되어 있습니다.",
    };
  }

  const url = new URL(request.url);
  const headerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const queryToken = url.searchParams.get("token")?.trim();
  const via: "query" | "header" = headerToken ? "header" : "query";
  const provided = headerToken || queryToken || "";

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, message: "유효하지 않은 위젯 토큰입니다." };
  }

  return { ok: true, via };
}

/**
 * CDN 캐시 키는 URL(쿼리 포함)만 보고 헤더는 보지 않는다.
 * 따라서 토큰이 쿼리에 있을 때만 공유 캐시를 허용해야 무인증 요청에 캐시가 새지 않는다.
 */
export function widgetCacheControl(via: "query" | "header") {
  const ttl = widgetCacheTtlSeconds();
  if (ttl <= 0) return "private, no-store";
  if (via === "header") return `private, max-age=${ttl}`;
  return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`;
}

function addWarning(warnings: WidgetWarning[], source: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!warnings.some((entry) => entry.source === source && entry.message === message)) {
    warnings.push({ source, message });
  }
}

function isQuotaWarning(warning: WidgetWarning) {
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(warning.message);
}

async function optionalQuery<T>(
  warnings: WidgetWarning[],
  source: string,
  fallback: T,
  query: () => Promise<T>,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    addWarning(warnings, source, error);
    return fallback;
  }
}

/** 오늘 날짜(위젯 타임존 기준)를 돌려준다. `date` 쿼리로 덮어쓸 수 있어 디버깅에 쓴다. */
export function resolveWidgetDate(requested: string | null | undefined) {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  return dateStringInTimeZone(new Date(), resolveWidgetTimeZone());
}

async function fetchWidgetRows(date: string, warnings: WidgetWarning[]): Promise<WidgetSourceRows> {
  const supabase = await createClient();
  const week = getISOWeekString(parseDateString(date));

  const [habits, habitLogs, todos, weeklyGoals] = await Promise.all([
    optionalQuery(warnings, "daily_habits", [] as WidgetSourceRows["habits"], async () => {
      const { data, error } = await supabase
        .from("daily_habits")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
      }));
    }),
    optionalQuery(warnings, "habit_logs", [] as WidgetSourceRows["habitLogs"], async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("habit_id, completed")
        .eq("date", date)
        .eq("completed", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        habit_id: String(row.habit_id),
        completed: row.completed !== false,
      }));
    }),
    optionalQuery(warnings, "daily_todos", [] as WidgetSourceRows["todos"], async () => {
      const { data, error } = await supabase
        .from("daily_todos")
        .select("text, completed, sort_order")
        .eq("date", date)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        text: String(row.text ?? ""),
        completed: row.completed === true,
        sort_order: Number(row.sort_order ?? 0),
      }));
    }),
    optionalQuery(warnings, "weekly_goals", [] as WidgetSourceRows["weeklyGoals"], async () => {
      const { data, error } = await supabase
        .from("weekly_goals")
        .select("text, pillar, completed, sort_order")
        .eq("week", week)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        text: String(row.text ?? ""),
        pillar: (row.pillar as Pillar) ?? "career",
        completed: row.completed === true,
        sort_order: Number(row.sort_order ?? 0),
      }));
    }),
  ]);

  return { habits, habitLogs, todos, weeklyGoals };
}

function emptyPayload(date: string, warnings: WidgetWarning[]): WidgetPayload {
  return {
    summary: buildWidgetSummary(
      date,
      { habits: [], habitLogs: [], todos: [], weeklyGoals: [] },
      new Date(),
    ),
    warnings,
  };
}

/**
 * 위젯은 OS가 주기적으로 폴링하므로 매 요청마다 Firestore를 읽으면 읽기 쿼터를 태운다.
 * 인스턴스 메모리 캐시 + 쿼터 쿨다운으로 읽기 횟수를 묶는다.
 */
export async function getWidgetPayload(
  date: string,
): Promise<{ payload: WidgetPayload; cacheStatus: WidgetCacheStatus }> {
  const cached = widgetCache.get(date);
  if (cached && cached.expiresAt > Date.now()) {
    return { payload: cached.payload, cacheStatus: "hit" };
  }

  if (Date.now() < firestoreQuotaCooldownUntil) {
    const payload = cached?.payload ?? emptyPayload(date, []);
    return {
      payload: {
        ...payload,
        warnings: [
          ...payload.warnings.filter((warning) => warning.source !== "firestore-quota"),
          {
            source: "firestore-quota",
            message: `Firestore quota retry cooldown active until ${new Date(firestoreQuotaCooldownUntil).toISOString()}`,
          },
        ],
      },
      cacheStatus: "quota-cooldown",
    };
  }

  const warnings: WidgetWarning[] = [];
  let rows: WidgetSourceRows;

  try {
    rows = await fetchWidgetRows(date, warnings);
  } catch (error) {
    addWarning(warnings, "firestore", error);
    rows = { habits: [], habitLogs: [], todos: [], weeklyGoals: [] };
  }

  if (warnings.some(isQuotaWarning)) {
    firestoreQuotaCooldownUntil = Date.now() + FIRESTORE_QUOTA_COOLDOWN_MS;
  }

  const payload: WidgetPayload = {
    summary: buildWidgetSummary(date, rows, new Date()),
    warnings,
  };

  const ttlSeconds = widgetCacheTtlSeconds();
  if (ttlSeconds > 0) {
    widgetCache.set(date, { expiresAt: Date.now() + ttlSeconds * 1000, payload });
  }

  return { payload, cacheStatus: "miss" };
}

/** 테스트용. 모듈 캐시를 비운다. */
export function resetWidgetCacheForTests() {
  widgetCache.clear();
  firestoreQuotaCooldownUntil = 0;
}
