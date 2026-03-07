import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/utils";

interface EveningIntakeBody {
  date?: string;
  completed?: string[];
  incomplete?: string[];
  incompleteReason?: string;
  tomorrowTop?: string[];
  risks?: string[];
  deadlines?: string[];
  chatText?: string;
  autoFromLatestConversation?: boolean;
  todoDateMode?: "same-day" | "next-day";
  autoApplyToToday?: boolean;
}

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

function parseRisks(answer2: string) {
  if (!answer2) return [];
  const bullets = splitBulletList(answer2);
  if (bullets.length > 0) return bullets;
  return answer2
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function parseDeadlines(answer1: string) {
  if (!answer1) return [];
  const deadlineMatches = answer1.match(/\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2}/g) ?? [];
  if (deadlineMatches.length === 0) return [];
  return deadlineMatches.map((d) => `내일 ${d}`);
}

function parseTomorrowTop(answer1: string, answer4: string, answer5: string) {
  return dedupeTodos([
    normalizeTopItem(answer1),
    normalizeTopItem(answer4),
    normalizeTopItem(answer5),
  ]).slice(0, 3);
}

async function findAutoChatText(supabase: Awaited<ReturnType<typeof createClient>>, date: string) {
  const { data } = await supabase
    .from("conversations")
    .select("date, source_text, summary, to_improve, created_at")
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "";

  const parts = [data.source_text, data.summary, data.to_improve].filter(Boolean);
  return parts.join("\n\n").trim();
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

function parseChatText(text: string) {
  const completedRaw = extractSection(text, "오늘 완료:", ["미완료:", "미완료 이유:", "22:05 보완 질문 시작"]);
  const incompleteRaw = extractSection(text, "미완료:", ["미완료 이유:", "22:05 보완 질문 시작"]);
  const reasonRaw = extractSection(text, "미완료 이유:", ["22:05 보완 질문 시작"]);

  const answer1 = extractAnswer(text, 1);
  const answer2 = extractAnswer(text, 2);
  const answer3 = extractAnswer(text, 3);
  const answer4 = extractAnswer(text, 4);
  const answer5 = extractAnswer(text, 5);

  const completed = splitBulletList(completedRaw).map(cleanTodoText);
  const incomplete = splitBulletList(incompleteRaw).map(normalizeTopItem);
  if (answer3) {
    const mustCarry = normalizeTopItem(answer3);
    if (mustCarry && !incomplete.includes(mustCarry)) incomplete.unshift(mustCarry);
  }

  const incompleteReason = [reasonRaw, answer2 ? `[보완 Q2]\n${answer2}` : ""].filter(Boolean).join("\n\n");
  const tomorrowTop = parseTomorrowTop(answer1, answer4, answer5);
  const risks = parseRisks(answer2);
  const deadlines = parseDeadlines(answer1);

  return {
    completed,
    incomplete,
    incompleteReason,
    tomorrowTop,
    risks,
    deadlines,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EveningIntakeBody;
    const supabase = await createClient();

    const date = body.date || defaultIntakeDate();
    const targetTodoDate = resolveTargetTodoDate(date, body.todoDateMode ?? "next-day");

    const autoChatText = body.autoFromLatestConversation
      ? await findAutoChatText(supabase, date)
      : "";
    const effectiveChatText = (body.chatText || autoChatText || "").trim();
    const parsed = effectiveChatText ? parseChatText(effectiveChatText) : null;

    const completed = (body.completed ?? parsed?.completed ?? []).filter(Boolean);
    const incomplete = (body.incomplete ?? parsed?.incomplete ?? []).filter(Boolean);
    const tomorrowTop = (body.tomorrowTop ?? parsed?.tomorrowTop ?? []).filter(Boolean).slice(0, 3);
    const risks = (body.risks ?? parsed?.risks ?? []).filter(Boolean).slice(0, 3);

    const backlogCandidates = dedupeTodos([
      ...tomorrowTop,
      ...incomplete,
    ]);

    const backlogResult = await saveBacklogItems(supabase, date, backlogCandidates);

    if (tomorrowTop.length > 0) {
      const { data: existingTodos } = await supabase
        .from("daily_todos")
        .select("text")
        .eq("date", targetTodoDate);

      const existingSet = new Set((existingTodos ?? []).map((x) => x.text.trim()));

      const rows = tomorrowTop
        .filter((text) => !existingSet.has(text.trim()))
        .map((text, idx) => ({
          date: targetTodoDate,
          text,
          sort_order: idx,
          completed: false,
        }));

      if (rows.length > 0) {
        const { error: todoError } = await supabase
          .from("daily_todos")
          .insert(rows);

        if (todoError) {
          return NextResponse.json({
            ok: true,
            partial: true,
            message: "todo 일부 저장 실패",
            todoError: todoError.message,
            date,
            targetTodoDate,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      targetTodoDate,
      parsedFromChat: Boolean(effectiveChatText),
      autoSourceUsed: Boolean(body.autoFromLatestConversation && autoChatText),
      saved: {
        completed: completed.length,
        incomplete: incomplete.length,
        tomorrowTop: tomorrowTop.length,
        backlog: backlogResult.saved,
        risks: risks.length,
      },
      backlogError: backlogResult.error,
      autoApplyToToday: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
