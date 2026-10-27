import { timingSafeEqual } from "node:crypto";

import { isTodoCategory } from "./todo-category";

/**
 * Claude 전용 API(`/api/claude/*`) 공용 도구.
 *
 * 쿠키를 가질 수 없는 Claude(예약 작업·채팅)가 접근 키 게이트 밖에서 일정을 읽고
 * 추가·수정할 수 있게 하는 길. 토큰(`PLNA_CLAUDE_TOKEN`)으로만 연다.
 * - 삭제는 일부러 만들지 않는다. 토큰이 새거나 Claude가 실수해도 기록이 지워지지 않게.
 * - 수정은 허용한 필드만 받는다. 임의 필드를 문서에 써 넣지 못하게.
 */

export type ClaudeAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

export function resolveClaudeToken(): string | null {
  const token = process.env.PLNA_CLAUDE_TOKEN?.trim();
  return token ? token : null;
}

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** `Authorization: Bearer <토큰>` 헤더만 받는다. URL 쿼리 토큰은 로그에 남기 쉬워 받지 않는다. */
export function authorizeClaude(request: Request): ClaudeAuthResult {
  const expected = resolveClaudeToken();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      message: "PLNA_CLAUDE_TOKEN이 설정되지 않아 Claude API가 비활성화되어 있습니다.",
    };
  }

  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, message: "유효하지 않은 Claude 토큰입니다." };
  }
  return { ok: true };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const QUARTER_RE = /^\d{4}-Q[1-4]$/;
const PILLARS = ["career", "identity", "assets"] as const;
export type ClaudePillar = (typeof PILLARS)[number];

export const MAX_TEXT_LENGTH = 300;
export const MAX_RANGE_DAYS = 31;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isWeekString(value: unknown): value is string {
  return typeof value === "string" && WEEK_RE.test(value);
}

export function isQuarterString(value: unknown): value is string {
  return typeof value === "string" && QUARTER_RE.test(value);
}

export function isPillar(value: unknown): value is ClaudePillar {
  return typeof value === "string" && (PILLARS as readonly string[]).includes(value);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(value: unknown): Parsed<string> {
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: "text는 필수입니다." };
  const text = value.trim();
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `text는 ${MAX_TEXT_LENGTH}자 이하여야 합니다.` };
  }
  return { ok: true, value: text };
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.includes("/") || id.length > 200) return null;
  return id;
}

/** 날짜 범위(양 끝 포함). 너무 넓은 조회로 Firestore 읽기가 폭주하지 않게 31일로 묶는다. */
export function parseDateRange(from: unknown, to: unknown): Parsed<{ from: string; to: string }> {
  if (!isDateString(from)) return { ok: false, error: "from은 YYYY-MM-DD 형식이어야 합니다." };
  const end = to === null || to === undefined || to === "" ? from : to;
  if (!isDateString(end)) return { ok: false, error: "to는 YYYY-MM-DD 형식이어야 합니다." };
  if (end < from) return { ok: false, error: "to는 from보다 앞설 수 없습니다." };
  const days =
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000 + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `조회 범위는 ${MAX_RANGE_DAYS}일 이하여야 합니다.` };
  return { ok: true, value: { from, to: end } };
}

export interface TodoCreate {
  date: string;
  text: string;
  category: string;
  sort_order: number;
}

export function parseTodoCreate(body: unknown): Parsed<TodoCreate> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON 객체가 필요합니다." };
  if (!isDateString(record.date)) return { ok: false, error: "date는 YYYY-MM-DD 형식이어야 합니다." };
  const text = cleanText(record.text);
  if (!text.ok) return text;
  const category = record.category ?? "personal";
  if (!isTodoCategory(category)) return { ok: false, error: "category가 올바르지 않습니다." };
  const sortOrder = Number(record.sort_order ?? 0);
  return {
    ok: true,
    value: {
      date: record.date,
      text: text.value,
      category,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
  };
}

export interface TodoPatch {
  id: string;
  date?: string;
  text?: string;
  completed?: boolean;
  category?: string;
  sort_order?: number;
}

export function parseTodoPatch(body: unknown): Parsed<TodoPatch> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON 객체가 필요합니다." };
  const id = cleanId(record.id);
  if (!id) return { ok: false, error: "id는 필수입니다." };
  const patch: TodoPatch = { id };

  if (record.date !== undefined) {
    if (!isDateString(record.date)) return { ok: false, error: "date는 YYYY-MM-DD 형식이어야 합니다." };
    patch.date = record.date;
  }
  if (record.text !== undefined) {
    const text = cleanText(record.text);
    if (!text.ok) return text;
    patch.text = text.value;
  }
  if (record.completed !== undefined) {
    if (typeof record.completed !== "boolean") return { ok: false, error: "completed는 true/false여야 합니다." };
    patch.completed = record.completed;
  }
  if (record.category !== undefined) {
    if (!isTodoCategory(record.category)) return { ok: false, error: "category가 올바르지 않습니다." };
    patch.category = record.category;
  }
  if (record.sort_order !== undefined) {
    const sortOrder = Number(record.sort_order);
    if (!Number.isFinite(sortOrder)) return { ok: false, error: "sort_order는 숫자여야 합니다." };
    patch.sort_order = sortOrder;
  }
  if (Object.keys(patch).length === 1) return { ok: false, error: "바꿀 필드가 없습니다." };
  return { ok: true, value: patch };
}

export interface WeeklyGoalCreate {
  week: string;
  text: string;
  pillar: ClaudePillar;
}

export function parseWeeklyGoalCreate(body: unknown): Parsed<WeeklyGoalCreate> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON 객체가 필요합니다." };
  if (!isWeekString(record.week)) return { ok: false, error: "week는 YYYY-Www 형식이어야 합니다." };
  const text = cleanText(record.text);
  if (!text.ok) return text;
  if (!isPillar(record.pillar)) return { ok: false, error: "pillar는 career/identity/assets 중 하나여야 합니다." };
  return { ok: true, value: { week: record.week, text: text.value, pillar: record.pillar } };
}

export interface GoalPatch {
  id: string;
  text?: string;
  completed?: boolean;
}

/** 주간·분기 목표 수정: 문구와 완료 여부만 바꿀 수 있다. */
export function parseGoalPatch(body: unknown): Parsed<GoalPatch> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON 객체가 필요합니다." };
  const id = cleanId(record.id);
  if (!id) return { ok: false, error: "id는 필수입니다." };
  const patch: GoalPatch = { id };
  if (record.text !== undefined) {
    const text = cleanText(record.text);
    if (!text.ok) return text;
    patch.text = text.value;
  }
  if (record.completed !== undefined) {
    if (typeof record.completed !== "boolean") return { ok: false, error: "completed는 true/false여야 합니다." };
    patch.completed = record.completed;
  }
  if (Object.keys(patch).length === 1) return { ok: false, error: "바꿀 필드가 없습니다." };
  return { ok: true, value: patch };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
