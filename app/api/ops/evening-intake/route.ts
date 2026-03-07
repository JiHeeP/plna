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
}

function nextDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateString(d);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EveningIntakeBody;
    const supabase = await createClient();

    const date = body.date || toDateString(new Date());
    const targetTodoDate = nextDate(date);

    const completed = (body.completed ?? []).filter(Boolean);
    const incomplete = (body.incomplete ?? []).filter(Boolean);
    const tomorrowTop = (body.tomorrowTop ?? []).filter(Boolean).slice(0, 3);
    const risks = (body.risks ?? []).filter(Boolean).slice(0, 3);
    const deadlines = (body.deadlines ?? []).filter(Boolean).slice(0, 5);

    const wentWell = completed.length
      ? completed.map((x) => `- ${x}`).join("\n")
      : "";

    const toImproveParts = [
      incomplete.length ? `[미완료]\n${incomplete.map((x) => `- ${x}`).join("\n")}` : "",
      body.incompleteReason ? `[이유]\n${body.incompleteReason}` : "",
      risks.length ? `[리스크]\n${risks.map((x) => `- ${x}`).join("\n")}` : "",
      deadlines.length ? `[마감]\n${deadlines.map((x) => `- ${x}`).join("\n")}` : "",
    ].filter(Boolean);

    const accomplishments = tomorrowTop.length
      ? `[내일 최우선]\n${tomorrowTop.map((x, i) => `${i + 1}) ${x}`).join("\n")}`
      : "";

    const { error: journalError } = await supabase
      .from("daily_journals")
      .upsert(
        {
          date,
          accomplishments,
          went_well: wentWell,
          to_improve: toImproveParts.join("\n\n"),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date" },
      );

    if (journalError) {
      return NextResponse.json({ ok: false, error: journalError.message }, { status: 500 });
    }

    if (tomorrowTop.length > 0) {
      const rows = tomorrowTop.map((text, idx) => ({
        date: targetTodoDate,
        text,
        sort_order: idx,
        completed: false,
      }));

      const { error: todoError } = await supabase
        .from("daily_todos")
        .insert(rows);

      if (todoError) {
        // journal is saved anyway; return partial success
        return NextResponse.json({
          ok: true,
          partial: true,
          message: "저널 저장 완료, todo 일부 저장 실패",
          todoError: todoError.message,
          date,
          targetTodoDate,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      targetTodoDate,
      saved: {
        completed: completed.length,
        incomplete: incomplete.length,
        tomorrowTop: tomorrowTop.length,
        risks: risks.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
