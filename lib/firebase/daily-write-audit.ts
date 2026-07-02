import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "./server";

type DailyWriteTarget = "journal" | "todo" | "habit_log" | "local_backup_sync";
type DailyWriteStatus = "success" | "error";

export interface PublicDailyWriteAuditRecord {
  created_at: string;
  target: string;
  target_collection: string;
  action: string;
  status: string;
  date: string | null;
  error_message: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

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

function cleanMetadata(metadata: DailyWriteAuditInput["metadata"]): Record<string, string | number | boolean | null> {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean | null] => {
      const value = entry[1];
      return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null;
    }),
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

export function toPublicDailyWriteAuditRecord(row: Record<string, unknown>): PublicDailyWriteAuditRecord {
  const record = buildDailyWriteAuditRecord({
    target: (row.target === "journal" ||
      row.target === "todo" ||
      row.target === "habit_log" ||
      row.target === "local_backup_sync")
      ? row.target
      : "local_backup_sync",
    action: typeof row.action === "string" ? row.action : "unknown",
    status: row.status === "success" ? "success" : "error",
    date: typeof row.date === "string" ? row.date : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    metadata: row.metadata && typeof row.metadata === "object"
      ? row.metadata as DailyWriteAuditInput["metadata"]
      : undefined,
  }, typeof row.created_at === "string" ? new Date(row.created_at) : new Date());

  return {
    created_at: record.created_at,
    target: record.target,
    target_collection: record.target_collection,
    action: record.action,
    status: record.status,
    date: record.date,
    error_message: record.error_message,
    metadata: record.metadata,
  };
}

export function summarizeDailyWriteAudit(records: PublicDailyWriteAuditRecord[]) {
  const summary = {
    by_status: {} as Record<string, number>,
    by_target: {} as Record<string, number>,
    by_date: {} as Record<string, number>,
    errors: 0,
    successes: 0,
  };

  for (const record of records) {
    summary.by_status[record.status] = (summary.by_status[record.status] ?? 0) + 1;
    summary.by_target[record.target] = (summary.by_target[record.target] ?? 0) + 1;
    if (record.date) {
      summary.by_date[record.date] = (summary.by_date[record.date] ?? 0) + 1;
    }
    if (record.status === "success") summary.successes += 1;
    if (record.status === "error") summary.errors += 1;
  }

  return summary;
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
