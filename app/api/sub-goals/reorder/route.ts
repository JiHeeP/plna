import { createClient } from "@/lib/supabase/server";
import { NextResponse, NextRequest } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items 배열이 필요합니다" }, { status: 400 });
    }

    const updates = items.map(
      (item: { id: string; pillar: string; sort_order: number }) =>
        supabase
          .from("sub_goals")
          .update({
            pillar: item.pillar,
            sort_order: item.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sub goals reorder error:", e);
    return NextResponse.json({ error: "재정렬 실패" }, { status: 500 });
  }
}
