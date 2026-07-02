"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, Clipboard, RefreshCw, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildLocalDailyBackupPayloadFromEntries,
  buildLocalDailyDashboardData,
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
} from "@/lib/local-daily-backup";

const RECOVERY_BOOKMARKLET =
  'javascript:fetch("https://plna.vercel.app/daily-backup-recovery.js").then(r=>r.text()).then(eval)';

interface BackupStatus {
  journals: number;
  todos: number;
  habitChecks: number;
  latestWeek: string | null;
  lastSync: Record<string, unknown> | null;
  syncState: Record<string, unknown> | null;
  remoteError: Record<string, unknown> | null;
}

function readJson(key: string) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readBackupStatus(): BackupStatus {
  const payload = buildLocalDailyBackupPayloadFromEntries(
    Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index) ?? "";
      return [key, localStorage.getItem(key) ?? ""] as [string, string];
    }),
  );
  const localDashboard = buildLocalDailyDashboardData(payload);

  return {
    journals: payload.journals.length,
    todos: payload.todos.length,
    habitChecks: payload.habitChecks.length,
    latestWeek: localDashboard?.week ?? null,
    lastSync: readJson("plna_local_daily_backup_last_sync"),
    syncState: readJson("plna_local_daily_backup_sync_state"),
    remoteError: readJson("plna_weekly_dashboard_remote_error_state"),
  };
}

function statusTime(value: unknown) {
  return typeof value === "string" ? value.replace("T", " ").slice(0, 19) : "-";
}

function getBackupStatusSnapshot() {
  if (typeof window === "undefined") return "";
  return JSON.stringify(readBackupStatus());
}

function subscribeBackupStatus(onStoreChange: () => void) {
  window.addEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function LocalDailyBackupStatus() {
  const statusSnapshot = useSyncExternalStore(
    subscribeBackupStatus,
    getBackupStatusSnapshot,
    () => "",
  );
  const status = useMemo(
    () => (statusSnapshot ? JSON.parse(statusSnapshot) as BackupStatus : null),
    [statusSnapshot],
  );
  const [copied, setCopied] = useState(false);
  const [retryRequested, setRetryRequested] = useState(false);

  const total = status ? status.journals + status.todos + status.habitChecks : 0;
  const hasBackup = total > 0;
  const syncFailedAt = status?.syncState?.failed_at;
  const remoteFailedAt = status?.remoteError?.failed_at;

  return (
    <div className="space-y-4 px-4 pt-6 pb-24 lg:px-8 lg:pt-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">백업 상태</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          현재 브라우저 기준
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base lg:text-lg">
            데일리 백업
            <Badge variant={hasBackup ? "default" : "outline"}>
              {hasBackup ? "있음" : "없음"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-3">
              <div className="text-lg font-bold">{status?.journals ?? 0}</div>
              <div className="text-xs text-muted-foreground">기록</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-lg font-bold">{status?.todos ?? 0}</div>
              <div className="text-xs text-muted-foreground">할 일</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-lg font-bold">{status?.habitChecks ?? 0}</div>
              <div className="text-xs text-muted-foreground">습관</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">최근 주차</span>
            <span className="font-medium">{status?.latestWeek ?? "-"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
            {syncFailedAt || remoteFailedAt ? (
              <TriangleAlert className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            연결 상태
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Firebase 백업</span>
            <span className="text-right">{syncFailedAt ? `실패 ${statusTime(syncFailedAt)}` : "대기"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">대시보드 원격 읽기</span>
            <span className="text-right">{remoteFailedAt ? `실패 ${statusTime(remoteFailedAt)}` : "대기"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">마지막 동기화</span>
            <span className="text-right">{statusTime(status?.lastSync?.synced_at)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem("plna_local_daily_backup_sync_state");
            window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_CHANGED_EVENT));
            setRetryRequested(true);
          }}
          disabled={!hasBackup}
        >
          <RefreshCw className="h-4 w-4" />
          동기화 재시도
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(RECOVERY_BOOKMARKLET);
            setCopied(true);
          }}
        >
          <Clipboard className="h-4 w-4" />
          {copied ? "복사됨" : "복구 코드 복사"}
        </Button>
        <Button asChild className="sm:col-span-2">
          <Link href="/weekly-dashboard">대시보드로 이동</Link>
        </Button>
      </div>

      {retryRequested && (
        <p className="text-center text-xs text-muted-foreground">
          동기화 재시도를 요청했습니다.
        </p>
      )}
    </div>
  );
}
