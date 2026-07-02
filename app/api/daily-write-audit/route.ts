import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import {
  summarizeDailyWriteAudit,
  toPublicDailyWriteAuditRecord,
} from "@/lib/firebase/daily-write-audit";
import { getFirebaseAdminApp } from "@/lib/firebase/server";

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(date: Date) {
  return new Date(`${toDateOnly(date)}T23:59:59.999Z`);
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(Math.max(Math.trunc(parsed), 1), 500);
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 13);

  const startDate = parseDate(request.nextUrl.searchParams.get("start"), defaultStart);
  const endDate = endOfDay(parseDate(request.nextUrl.searchParams.get("end"), now));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  try {
    const db = getFirestore(getFirebaseAdminApp());
    const snapshot = await db
      .collection("daily_write_audit")
      .where("created_at", ">=", startIso)
      .where("created_at", "<=", endIso)
      .limit(limit)
      .get();

    const records = snapshot.docs
      .map((doc) => toPublicDailyWriteAuditRecord(doc.data()))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));

    return NextResponse.json(
      {
        start: toDateOnly(startDate),
        end: toDateOnly(endDate),
        limit,
        count: records.length,
        summary: summarizeDailyWriteAudit(records),
        records,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: message,
        source: "daily_write_audit",
        start: toDateOnly(startDate),
        end: toDateOnly(endDate),
      },
      { status: 500 },
    );
  }
}
