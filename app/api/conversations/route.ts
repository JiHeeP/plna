import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    query = query.gte("date", start).lt("date", end);
  }

  if (search) {
    query = query.or(
      `partner.ilike.%${search}%,summary.ilike.%${search}%,went_well.ilike.%${search}%,to_improve.ilike.%${search}%`
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

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      date: body.date,
      partner: body.partner,
      context: body.context || "",
      summary: body.summary,
      went_well: body.went_well || "",
      to_improve: body.to_improve || "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
