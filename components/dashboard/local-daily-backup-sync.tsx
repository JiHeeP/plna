"use client";

import { useEffect } from "react";

import {
  buildLocalDailyBackupPayloadFromEntries,
  createLocalDailyBackupPayloadSignature,
  hasLocalDailyBackupPayload,
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
  LOCAL_DAILY_BACKUP_SYNC_EVENT,
} from "@/lib/local-daily-backup";

const SYNC_STATE_KEY = "plna_local_daily_backup_sync_state";
const FAILED_RETRY_MS = 10 * 60 * 1000;

interface LocalBackupSyncState {
  signature?: string;
  synced_at?: string;
  failed_at?: string;
}

function readSyncState(): LocalBackupSyncState {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function shouldSkipSync(signature: string) {
  const state = readSyncState();
  if (state.signature !== signature) return false;
  if (state.synced_at) return true;
  if (!state.failed_at) return false;

  const failedAt = Date.parse(state.failed_at);
  return Number.isFinite(failedAt) && Date.now() - failedAt < FAILED_RETRY_MS;
}

function saveSyncState(state: LocalBackupSyncState) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

export function LocalDailyBackupSync() {
  useEffect(() => {
    let cancelled = false;

    async function syncLocalBackups() {
      const payload = buildLocalDailyBackupPayloadFromEntries(
        Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index) ?? "";
          return [key, localStorage.getItem(key) ?? ""] as [string, string];
        }),
      );

      if (!hasLocalDailyBackupPayload(payload)) return;

      const signature = createLocalDailyBackupPayloadSignature(payload);
      if (shouldSkipSync(signature)) return;

      try {
        const response = await fetch("/api/local-daily-backup/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok || !result?.ok) {
          saveSyncState({
            signature,
            failed_at: new Date().toISOString(),
          });
          return;
        }

        localStorage.setItem(
          "plna_local_daily_backup_last_sync",
          JSON.stringify({
            synced_at: new Date().toISOString(),
            synced: result.synced,
          }),
        );
        saveSyncState({
          signature,
          synced_at: new Date().toISOString(),
        });

        window.dispatchEvent(
          new CustomEvent(LOCAL_DAILY_BACKUP_SYNC_EVENT, {
            detail: result.synced,
          }),
        );
      } catch {
        saveSyncState({
          signature,
          failed_at: new Date().toISOString(),
        });
      }
    }

    void syncLocalBackups();
    window.addEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, syncLocalBackups);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, syncLocalBackups);
    };
  }, []);

  return null;
}
