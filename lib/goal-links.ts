/**
 * 목표 수정·연결 공용 규칙.
 *
 * - 주간 목표는 "어느 월 목표 / 분기 목표를 위한 것인지"를 가리킬 수 있다
 *   (`monthly_goal_id`, `quarterly_goal_id`, 둘 다 선택. 없으면 null).
 * - 목표 PATCH는 허용한 칸만 받는다. 예전에는 body를 그대로 문서에 써서 id·week 같은 칸도 바뀔 수 있었다.
 */

const PILLARS = ["career", "identity", "assets"] as const;

export const GOAL_LINK_FIELDS = {
  monthly_goal_id: "monthly_goals",
  quarterly_goal_id: "quarterly_goals",
} as const;

export type GoalLinkField = keyof typeof GOAL_LINK_FIELDS;

export type GoalLinks = Partial<Record<GoalLinkField, string | null>>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function cleanLinkId(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  if (!id) return null;
  if (id.includes("/") || id.length > 200) return undefined;
  return id;
}

/** body에서 연결 칸만 골라낸다. 칸이 아예 없으면 결과에도 없다(= 바꾸지 않음). null은 연결 해제. */
export function parseGoalLinks(body: unknown): Parsed<GoalLinks> {
  const record = asRecord(body) ?? {};
  const links: GoalLinks = {};
  for (const field of Object.keys(GOAL_LINK_FIELDS) as GoalLinkField[]) {
    if (record[field] === undefined) continue;
    const id = cleanLinkId(record[field]);
    if (id === undefined) return { ok: false, error: `${field}는 목표 id 문자열이거나 null이어야 합니다.` };
    links[field] = id;
  }
  return { ok: true, value: links };
}

export interface GoalUpdate {
  id: string;
  updates: Record<string, unknown>;
}

/**
 * 웹 화면의 월·분기·주간 목표 PATCH body 검사.
 * 허용: text, completed, pillar, sort_order (+ 주간 목표만 연결 칸).
 */
export function parseGoalUpdate(body: unknown, options: { allowLinks?: boolean } = {}): Parsed<GoalUpdate> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "JSON 객체가 필요합니다." };
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id || id.includes("/")) return { ok: false, error: "id는 필수입니다" };

  const updates: Record<string, unknown> = {};
  if (record.text !== undefined) {
    if (typeof record.text !== "string" || !record.text.trim()) {
      return { ok: false, error: "text는 비어 있을 수 없습니다." };
    }
    updates.text = record.text.trim();
  }
  if (record.completed !== undefined) {
    if (typeof record.completed !== "boolean") return { ok: false, error: "completed는 true/false여야 합니다." };
    updates.completed = record.completed;
  }
  if (record.pillar !== undefined) {
    if (typeof record.pillar !== "string" || !(PILLARS as readonly string[]).includes(record.pillar)) {
      return { ok: false, error: "pillar는 career/identity/assets 중 하나여야 합니다." };
    }
    updates.pillar = record.pillar;
  }
  if (record.sort_order !== undefined) {
    const sortOrder = Number(record.sort_order);
    if (!Number.isFinite(sortOrder)) return { ok: false, error: "sort_order는 숫자여야 합니다." };
    updates.sort_order = sortOrder;
  }
  if (options.allowLinks) {
    const links = parseGoalLinks(record);
    if (!links.ok) return links;
    Object.assign(updates, links.value);
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: "바꿀 필드가 없습니다." };
  return { ok: true, value: { id, updates } };
}

type LinkLookupClient = {
  from(collectionName: string): {
    select(fields?: string): {
      eq(field: string, value: unknown): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/** 연결하려는 월·분기 목표가 실제로 있는지 확인한다. 없으면 잘못된 id로 끊긴 연결이 생기지 않게 막는다. */
export async function verifyGoalLinks(client: LinkLookupClient, links: GoalLinks): Promise<string | null> {
  // 다른 칸(text 등)이 섞인 객체를 넘겨도 되도록 연결 칸만 본다.
  for (const field of Object.keys(GOAL_LINK_FIELDS) as GoalLinkField[]) {
    const id = links[field];
    if (typeof id !== "string" || !id) continue;
    const { data, error } = await client.from(GOAL_LINK_FIELDS[field]).select("id").eq("id", id);
    if (error) return error.message;
    if (!Array.isArray(data) || data.length === 0) {
      return `${field}가 가리키는 목표(${id})를 찾을 수 없습니다.`;
    }
  }
  return null;
}

/** 새 주간 목표에 넣을 연결 칸 기본값(없으면 null). */
export function goalLinkDefaults(links: GoalLinks): Record<GoalLinkField, string | null> {
  return {
    monthly_goal_id: links.monthly_goal_id ?? null,
    quarterly_goal_id: links.quarterly_goal_id ?? null,
  };
}
