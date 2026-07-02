"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  hasLocalDailyBackupPayload,
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
  localDailyBackupPayloadToStorageEntries,
  normalizeLocalDailyBackupPayload,
} from "@/lib/local-daily-backup";

interface ImportMessage {
  type?: string;
  payload?: unknown;
  sourceOrigin?: string;
  transferId?: string;
}

function importPayload(payloadInput: unknown) {
  const payload = normalizeLocalDailyBackupPayload(payloadInput);
  if (!hasLocalDailyBackupPayload(payload)) return null;

  const entries = localDailyBackupPayloadToStorageEntries(payload);
  entries.forEach(([key, value]) => localStorage.setItem(key, value));
  localStorage.removeItem("plna_local_daily_backup_sync_state");
  localStorage.setItem(
    "plna_local_daily_backup_imported_at",
    JSON.stringify({
      imported_at: new Date().toISOString(),
      journals: payload.journals.length,
      todos: payload.todos.length,
      habitChecks: payload.habitChecks.length,
    }),
  );
  window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_CHANGED_EVENT));

  return {
    journals: payload.journals.length,
    todos: payload.todos.length,
    habitChecks: payload.habitChecks.length,
    entries: entries.length,
  };
}

export function LocalDailyBackupImport() {
  const [status, setStatus] = useState<"waiting" | "imported" | "empty" | "error">("waiting");
  const [counts, setCounts] = useState<ReturnType<typeof importPayload>>(null);

  useEffect(() => {
    const receiveBackup = (event: MessageEvent<ImportMessage>) => {
      if (event.data?.type !== "plna:local-daily-backup-import") return;

      try {
        const imported = importPayload(event.data.payload);
        if (!imported) {
          setStatus("empty");
          return;
        }

        setCounts(imported);
        setStatus("imported");
        if (event.source && "postMessage" in event.source) {
          (event.source as Window).postMessage(
            {
              type: "plna:local-daily-backup-imported",
              transferId: event.data.transferId,
              imported,
            },
            event.origin,
          );
        }
        window.setTimeout(() => {
          window.location.href = "/weekly-dashboard";
        }, 1500);
      } catch {
        setStatus("error");
      }
    };

    window.addEventListener("message", receiveBackup);
    return () => window.removeEventListener("message", receiveBackup);
  }, []);

  return (
    <div className="px-4 pt-6 pb-24 lg:px-8 lg:pt-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
            {status === "imported" ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : status === "error" || status === "empty" ? (
              <TriangleAlert className="h-5 w-5 text-amber-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            데일리 백업 가져오기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm lg:text-base">
          {status === "waiting" && (
            <p className="text-muted-foreground">
              백업 데이터를 기다리는 중입니다.
            </p>
          )}
          {status === "imported" && counts && (
            <div className="space-y-2">
              <p className="font-medium text-green-700">
                로컬 백업을 이 브라우저로 가져왔습니다.
              </p>
              <p className="text-muted-foreground">
                기록 {counts.journals}개, 할 일 {counts.todos}개, 습관 체크 {counts.habitChecks}개
              </p>
            </div>
          )}
          {status === "empty" && (
            <p className="text-muted-foreground">
              가져올 데일리 백업이 없습니다.
            </p>
          )}
          {status === "error" && (
            <p className="text-muted-foreground">
              백업 데이터를 가져오지 못했습니다.
            </p>
          )}
          <Button
            className="w-full"
            variant={status === "imported" ? "default" : "outline"}
            onClick={() => {
              window.location.href = "/weekly-dashboard";
            }}
          >
            대시보드로 이동
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
