import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/firebase/server";

// GET /api/topics
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation_topics")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/topics
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const topic = body.topic?.trim();

  if (!topic) {
    return NextResponse.json({ error: "topic 필요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversation_topics")
    .insert({
      topic,
      category: body.category || null,
      content: body.content || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH /api/topics
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const id = body.id;

  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversation_topics")
    .update({ content: body.content ?? "" })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/topics?id=xxx
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("conversation_topics")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
