import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";
import { getISOWeekString, toDateString } from "@/lib/utils";

function parseMinutes(text: string) {
  const m = text.match(/(\d+)\s*분/);
  return m ? Number(m[1]) : null;
}

function parseDeadline(text: string) {
  const m = text.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "오늘 중";
}

function estimateMinutes(text: string) {
  return parseMinutes(text) ?? 30;
}

function buildBriefingLines(todos: { text: string }[], riskText: string) {
  const top3 = todos.slice(0, 3);
  const lines: string[] = [];

  for (let i = 0; i < 3; i += 1) {
    const t = top3[i];
    if (!t) {
      lines.push(`${i + 1}) [우선순위${i + 1}] 비어 있음 / 예상 20분 / 마감 오늘 중`);
      continue;
    }
    lines.push(
      `${i + 1}) [우선순위${i + 1}] ${t.text} / 예상 ${estimateMinutes(t.text)}분 / 마감 ${parseDeadline(t.text)}`,
    );
  }

  lines.push(`4) [리스크] ${riskText || "특이 리스크 없음. 우선순위 1번부터 시작."}`);
  lines.push(`5) [첫 30분] 우선순위1 시작 + 필요한 자료 먼저 열기`);

  return lines;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const date = req.nextUrl.searchParams.get("date") || toDateString(new Date());

    const prevDateObj = new Date(`${date}T00:00:00`);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = toDateString(prevDateObj);
    const week = getISOWeekString(new Date(`${date}T00:00:00`));

    const [todosRes, journalRes, weeklyGoalsRes] = await Promise.all([
      supabase
        .from("daily_todos")
        .select("text, completed, sort_order")
        .eq("date", date)
        .eq("completed", false)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("daily_journals")
        .select("to_improve, accomplishments")
        .eq("date", prevDate)
        .maybeSingle(),
      supabase
        .from("weekly_goals")
        .select("text, completed, sort_order")
        .eq("week", week)
        .eq("completed", false)
        .order("sort_order"),
    ]);

    if (todosRes.error) {
      return NextResponse.json({ ok: false, error: todosRes.error.message }, { status: 500 });
    }

    const todos = (todosRes.data ?? []).map((x) => ({ text: x.text }));
    const weeklyGoals = (weeklyGoalsRes.data ?? []).map((x) => x.text).slice(0, 2);

    // fallback: if today's todos are empty, seed from weekly goals
    if (todos.length === 0 && weeklyGoals.length > 0) {
      weeklyGoals.forEach((g) => todos.push({ text: g }));
    }

    const riskTextRaw: string = journalRes.data?.to_improve || "";
    const riskLine = riskTextRaw
      .split("\n")
      .map((x: string) => x.trim())
      .find((x: string) => x && !x.startsWith("[")) || "전날 로그 기준 큰 리스크 없음";

    const lines = buildBriefingLines(todos, riskLine);

    return NextResponse.json({
      ok: true,
      date,
      source: {
        todos: todosRes.data?.length ?? 0,
        prevJournal: !!journalRes.data,
        weeklyGoals: weeklyGoalsRes.data?.length ?? 0,
      },
      lines,
      format: {
        tone: "coach",
        length: "5-lines",
        fields: ["priority", "eta", "deadline", "risk"],
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
