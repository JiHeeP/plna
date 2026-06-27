import { createClient } from "@/lib/firebase/server";
import { NextResponse, NextRequest } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("sub_goals")
      .select("*")
      .eq("is_active", true)
      .order("pillar")
      .order("sort_order")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ subGoals: data ?? [] });
  } catch (e) {
    console.error("Sub goals GET error:", e);
    return NextResponse.json({ subGoals: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { pillar, name, ...rest } = body;

    if (!pillar || !name?.trim()) {
      return NextResponse.json({ error: "pillar와 name은 필수입니다" }, { status: 400 });
    }

    const { count } = await supabase
      .from("sub_goals")
      .select("id", { count: "exact", head: true })
      .eq("pillar", pillar)
      .eq("is_active", true);

    const { data, error } = await supabase
      .from("sub_goals")
      .insert({
        pillar,
        name: name.trim(),
        sort_order: count ?? 0,
        ...rest,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ subGoal: data });
  } catch (e) {
    console.error("Sub goals POST error:", e);
    return NextResponse.json({ error: "하위목표 생성 실패" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sub_goals")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sub goals PATCH error:", e);
    return NextResponse.json({ error: "하위목표 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sub_goals")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sub goals DELETE error:", e);
    return NextResponse.json({ error: "하위목표 삭제 실패" }, { status: 500 });
  }
}
