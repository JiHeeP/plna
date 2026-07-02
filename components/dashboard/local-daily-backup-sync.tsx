"use client";

import { useEffect } from "react";

import {
  buildLocalDailyBackupPayloadFromEntries,
  hasLocalDailyBackupPayload,
  LOCAL_DAILY_BACKUP_SYNC_EVENT,
} from "@/lib/local-daily-backup";

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

      try {
        const response = await fetch("/api/local-daily-backup/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok || cancelled) return;

        localStorage.setItem(
          "plna_local_daily_backup_last_sync",
          JSON.stringify({
            synced_at: new Date().toISOString(),
            synced: result.synced,
          }),
        );

        window.dispatchEvent(
          new CustomEvent(LOCAL_DAILY_BACKUP_SYNC_EVENT, {
            detail: result.synced,
          }),
        );
      } catch {
        // Keep the local backup keys intact; the next page load can retry.
      }
    }

    void syncLocalBackups();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
