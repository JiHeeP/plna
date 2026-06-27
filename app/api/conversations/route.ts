import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { toDateString } from "@/lib/utils";

function defaultIntakeDate() {
  const now = new Date();
  // 새벽(0~4시) 입력은 전날 저녁 로그로 간주
  if (now.getHours() < 5) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toDateString(d);
  }
  return toDateString(now);
}

function resolveTargetTodoDate(dateStr: string, mode?: "same-day" | "next-day") {
  if (mode === "same-day") return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateString(d);
}

function splitBulletList(block?: string | null) {
  if (!block) return [];
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}

function extractSection(text: string, startLabel: string, endLabels: string[]) {
  const escapedStart = startLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnds = endLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const endPattern = escapedEnds.length > 0 ? `(?=${escapedEnds.join("|")}|$)` : "$";
  const regex = new RegExp(`${escapedStart}\\s*\\n?([\\s\\S]*?)${endPattern}`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() || "";
}

function extractAnswer(text: string, n: number) {
  // 다음 번호가 n+1이 아니어도(예: 1 다음에 4) 다음 번호 문항에서 끊는다.
  const regex = new RegExp(`${n}\\s*[).]\\s*([\\s\\S]*?)(?=\\n\\s*\\d+\\s*[).]|$)`, "i");
  return text.match(regex)?.[1]?.trim() || "";
}

async function saveBacklogItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  items: string[],
) {
  if (items.length === 0) return { saved: 0, error: null as string | null };

  const { data: existing } = await supabase
    .from("ops_backlog_items")
    .select("text")
    .eq("date", date);

  const existingSet = new Set((existing ?? []).map((x) => x.text.trim()));
  const rows = items
    .filter((text) => !existingSet.has(text.trim()))
    .map((text, idx) => ({
      date,
      text,
      source: "night-log",
      status: "pending",
      sort_order: idx,
    }));

  if (rows.length === 0) return { saved: 0, error: null as string | null };

  const { error } = await supabase.from("ops_backlog_items").insert(rows);
  return { saved: rows.length, error: error?.message ?? null };
}

function cleanTodoText(text: string) {
  return text
    .replace(/^\s*[-•]\s*/, "")
    .replace(/^\s*\d+\s*[).]\s*/, "")
    .replace(/^\s*\(?\d+\)?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDeadline(text: string) {
  const m = text.match(/(\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/);
  return m?.[1]?.replace(/\s+/g, "") || "";
}

function normalizeTopItem(raw: string) {
  let t = cleanTodoText(raw)
    .replace(/^(최우선\/?마감|최우선|마감)\s*[:：]?\s*/i, "")
    .replace(/^(수업 준비가 제일 먼저 와야함\/?)/, "수업 준비/")
    .trim();

  if (/수업\s*준비/.test(t)) {
    const dl = extractDeadline(t);
    return dl ? `수업 준비 (마감 ${dl})` : "수업 준비";
  }

  if (/첫\s*30분/.test(t)) {
    t = t.replace(/^첫\s*30분\s*[:：]?\s*/i, "");
    return `첫 30분: ${t}`;
  }

  return t;
}

function canonicalKey(text: string) {
  return text
    .toLowerCase()
    .replace(/\(마감[^)]*\)/g, "")
    .replace(/[^가-힣a-z0-9]/g, "")
    .trim();
}

function dedupeTodos(items: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items.map(normalizeTopItem).filter(Boolean)) {
    const key = canonicalKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseForOps(sourceText: string) {
  const completedRaw = extractSection(sourceText, "오늘 완료:", ["미완료:", "미완료 이유:", "22:05 보완 질문 시작"]);
  const incompleteRaw = extractSection(sourceText, "미완료:", ["미완료 이유:", "22:05 보완 질문 시작"]);
  const reasonRaw = extractSection(sourceText, "미완료 이유:", ["22:05 보완 질문 시작"]);

  const answer1 = extractAnswer(sourceText, 1);
  const answer2 = extractAnswer(sourceText, 2);
  const answer3 = extractAnswer(sourceText, 3);
  const answer4 = extractAnswer(sourceText, 4);
  const answer5 = extractAnswer(sourceText, 5);

  const completed = splitBulletList(completedRaw).map(cleanTodoText);
  const incomplete = splitBulletList(incompleteRaw).map(normalizeTopItem);

  if (answer3) {
    const mustCarry = normalizeTopItem(answer3);
    if (mustCarry && !incomplete.includes(mustCarry)) incomplete.unshift(mustCarry);
  }

  const risks = splitBulletList(answer2).slice(0, 3);
  const deadlines = (answer1.match(/\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2}/g) ?? [])
    .map((d) => `내일 ${d}`)
    .slice(0, 5);

  const tomorrowTop = dedupeTodos([
    normalizeTopItem(answer1),
    normalizeTopItem(answer4),
    normalizeTopItem(answer5),
  ]).slice(0, 3);

  const incompleteReason = [reasonRaw, answer2 ? `[보완 Q2]\n${answer2}` : ""].filter(Boolean).join("\n\n");

  return {
    completed,
    incomplete,
    incompleteReason,
    tomorrowTop,
    risks,
    deadlines,
  };
}

function looksLikeNightLog(text: string) {
  return /(오늘 완료:|미완료:|22:05 보완 질문 시작|\n1\s*[).])/.test(text);
}

// GET /api/conversations?search=키워드&month=2026-02
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const search = request.nextUrl.searchParams.get("search") || "";
  const month = request.nextUrl.searchParams.get("month") || "";

  let query = supabase
    .from("conversations")
    .select("*")
    .order("date", { ascending: false });

  if (month) {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    query = query.gte("date", start).lt("date", end);
  }

  if (search) {
    query = query.or(
      `partner.ilike.%${search}%,summary.ilike.%${search}%,went_well.ilike.%${search}%,to_improve.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/conversations
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const sourceText = (body.source_text || body.sourceText || "").trim();

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      date: body.date,
      partner: body.partner,
      context: body.context || "",
      summary: body.summary,
      went_well: body.went_well || "",
      to_improve: body.to_improve || "",
      is_imported: Boolean(body.is_imported),
      source_text: sourceText || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shouldAutoOps = body.autoOps !== false && sourceText && looksLikeNightLog(sourceText);

  if (shouldAutoOps) {
    const date = body.date || defaultIntakeDate();
    const targetTodoDate = resolveTargetTodoDate(date, body.todoDateMode ?? "next-day");
    const parsed = parseForOps(sourceText);
    const backlogCandidates = dedupeTodos([
      ...parsed.tomorrowTop,
      ...parsed.incomplete,
    ]);

    await saveBacklogItems(supabase, date, backlogCandidates);

    if (parsed.tomorrowTop.length > 0) {
      const { data: existingTodos } = await supabase
        .from("daily_todos")
        .select("text")
        .eq("date", targetTodoDate);

      const existingSet = new Set((existingTodos ?? []).map((x) => x.text.trim()));
      const rows = parsed.tomorrowTop
        .filter((text) => !existingSet.has(text.trim()))
        .map((text, idx) => ({
          date: targetTodoDate,
          text,
          sort_order: idx,
          completed: false,
        }));

      if (rows.length > 0) {
        await supabase.from("daily_todos").insert(rows);
      }
    }
  }

  return NextResponse.json({
    ...data,
    autoOpsApplied: shouldAutoOps,
    autoApplyToToday: true,
  });
}
