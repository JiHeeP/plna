import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/utils";

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
  const regex = new RegExp(`${n}\\s*[).]\\s*([\\s\\S]*?)(?=\\n\\s*${n + 1}\\s*[).]|$)`, "i");
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

function parseForOps(sourceText: string) {
  const completedRaw = extractSection(sourceText, "오늘 완료:", ["미완료:", "미완료 이유:", "22:05 보완 질문 시작"]);
  const incompleteRaw = extractSection(sourceText, "미완료:", ["미완료 이유:", "22:05 보완 질문 시작"]);
  const reasonRaw = extractSection(sourceText, "미완료 이유:", ["22:05 보완 질문 시작"]);

  const answer1 = extractAnswer(sourceText, 1);
  const answer2 = extractAnswer(sourceText, 2);
  const answer3 = extractAnswer(sourceText, 3);
  const answer4 = extractAnswer(sourceText, 4);
  const answer5 = extractAnswer(sourceText, 5);

  const completed = splitBulletList(completedRaw);
  const incomplete = splitBulletList(incompleteRaw);

  if (answer3) {
    const mustCarry = answer3.replace(/^[-•]\s*/, "").trim();
    if (mustCarry && !incomplete.includes(mustCarry)) incomplete.unshift(mustCarry);
  }

  const risks = splitBulletList(answer2).slice(0, 3);
  const deadlines = (answer1.match(/\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2}/g) ?? [])
    .map((d) => `내일 ${d}`)
    .slice(0, 5);

  const tomorrowTop = [
    answer1?.replace(/\/$/, "").trim(),
    answer4?.replace(/^\(?\d+\)?\s*/, "").trim(),
    answer5 ? `첫 30분: ${answer5.trim().replace(/^첫\s*30분\s*[:：]\s*/i, "")}` : "",
  ]
    .filter(Boolean)
    .slice(0, 3);

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
      source_text: sourceText || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shouldAutoOps = body.autoOps !== false && sourceText && looksLikeNightLog(sourceText);

  if (shouldAutoOps) {
    const date = body.date || toDateString(new Date());
    const targetTodoDate = resolveTargetTodoDate(date, body.todoDateMode ?? "same-day");
    const parsed = parseForOps(sourceText);
    const backlogCandidates = Array.from(
      new Set([
        ...parsed.tomorrowTop,
        ...parsed.incomplete,
      ].map((x) => x.trim()).filter(Boolean)),
    );

    const wentWell = parsed.completed.length
      ? parsed.completed.map((x) => `- ${x}`).join("\n")
      : "";

    const toImproveParts = [
      parsed.incomplete.length ? `[미완료]\n${parsed.incomplete.map((x) => `- ${x}`).join("\n")}` : "",
      parsed.incompleteReason ? `[이유]\n${parsed.incompleteReason}` : "",
      parsed.risks.length ? `[리스크]\n${parsed.risks.map((x) => `- ${x}`).join("\n")}` : "",
      parsed.deadlines.length ? `[마감]\n${parsed.deadlines.map((x) => `- ${x}`).join("\n")}` : "",
    ].filter(Boolean);

    const accomplishments = parsed.tomorrowTop.length
      ? `[내일 최우선]\n${parsed.tomorrowTop.map((x, i) => `${i + 1}) ${x}`).join("\n")}`
      : "";

    await supabase.from("daily_journals").upsert(
      {
        date,
        accomplishments,
        went_well: wentWell,
        to_improve: toImproveParts.join("\n\n"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" },
    );

    await saveBacklogItems(supabase, date, backlogCandidates);

    if (parsed.tomorrowTop.length > 0 && body.autoApplyToToday === true) {
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
    autoApplyToToday: body.autoApplyToToday === true,
  });
}
