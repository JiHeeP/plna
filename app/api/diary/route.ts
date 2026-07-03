import { NextRequest, NextResponse } from "next/server";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";

import { dailyDiaryDocId, writeDailyDiary } from "@/lib/firebase/daily-record-writes";
import { getFirebaseAdminApp } from "@/lib/firebase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function normalizeDate(value: string | null) {
  const date = value || todayString();
  if (!DATE_PATTERN.test(date)) {
    throw new Error("date must use YYYY-MM-DD.");
  }
  return date;
}

function normalizeDiaryRow(data: DocumentData | undefined) {
  if (!data) return null;

  return {
    id: String(data.id ?? ""),
    date: String(data.date ?? ""),
    accomplishments: String(data.accomplishments ?? ""),
    to_improve: String(data.to_improve ?? ""),
    went_well: String(data.went_well ?? ""),
    created_at: String(data.created_at ?? ""),
    updated_at: String(data.updated_at ?? ""),
  };
}

export async function GET(request: NextRequest) {
  try {
    const targetDate = normalizeDate(request.nextUrl.searchParams.get("date"));
    const db = getFirestore(getFirebaseAdminApp());
    const snapshot = await db.collection("daily_diaries").doc(dailyDiaryDocId(targetDate)).get();

    return NextResponse.json(normalizeDiaryRow(snapshot.data()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetDate = normalizeDate(typeof body.date === "string" ? body.date : null);
    const data = await writeDailyDiary({
      date: targetDate,
      accomplishments: typeof body.accomplishments === "string" ? body.accomplishments : "",
      to_improve: typeof body.to_improve === "string" ? body.to_improve : "",
      went_well: typeof body.went_well === "string" ? body.went_well : "",
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
