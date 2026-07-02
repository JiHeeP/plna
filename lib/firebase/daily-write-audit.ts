import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "./server";

type DailyWriteTarget = "journal" | "todo" | "habit_log" | "local_backup_sync";
type DailyWriteStatus = "success" | "error";

interface DailyWriteAuditInput {
  target: DailyWriteTarget;
  action: string;
  status: DailyWriteStatus;
  date?: string | null;
  recordId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

const TARGET_COLLECTIONS: Record<DailyWriteTarget, string> = {
  journal: "daily_journals",
  todo: "daily_todos",
  habit_log: "habit_logs",
  local_backup_sync: "local_daily_backup",
};

function cleanText(value: string | null | undefined, maxLength = 240) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cleanMetadata(metadata: DailyWriteAuditInput["metadata"]) {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null,
    ),
  );
}

export function buildDailyWriteAuditRecord(input: DailyWriteAuditInput, createdAt = new Date()) {
  const targetCollection = TARGET_COLLECTIONS[input.target];

  return {
    created_at: createdAt.toISOString(),
    target: input.target,
    target_collection: targetCollection,
    action: cleanText(input.action, 80) ?? "unknown",
    status: input.status,
    date: cleanDate(input.date),
    record_id: cleanText(input.recordId, 160),
    error_message: cleanText(input.errorMessage),
    metadata: cleanMetadata(input.metadata),
  };
}

export async function recordDailyWriteAudit(input: DailyWriteAuditInput) {
  try {
    const db = getFirestore(getFirebaseAdminApp());
    await db.collection("daily_write_audit").doc().set(buildDailyWriteAuditRecord(input));
  } catch (error) {
    console.warn(
      "Daily write audit failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
