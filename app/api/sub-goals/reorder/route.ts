import { createClient } from "@/lib/firebase/server";
import { NextResponse, NextRequest } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items 배열이 필요합니다" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.updateMany(
      "sub_goals",
      items.map((item: { id: string; pillar: string; sort_order: number }) => ({
        id: String(item.id),
        data: { pillar: item.pillar, sort_order: item.sort_order, updated_at: now },
      })),
    );
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sub goals reorder error:", e);
    return NextResponse.json({ error: "재정렬 실패" }, { status: 500 });
  }
}
