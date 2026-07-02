"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  shiftWeek,
  formatWeekLabel,
} from "@/lib/utils";
import { PILLAR_LABELS } from "@/lib/constants";
import {
  buildLocalDailyBackupPayloadFromEntries,
  buildLocalDailyDashboardData,
  LOCAL_DAILY_BACKUP_CHANGED_EVENT,
  LOCAL_DAILY_BACKUP_SYNC_EVENT,
  type LocalDailyDashboardData,
} from "@/lib/local-daily-backup";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Save,
} from "lucide-react";
import type { WeeklyGoal } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const REMOTE_ERROR_STATE_KEY = "plna_weekly_dashboard_remote_error_state";
const REMOTE_RETRY_MS = 10 * 60 * 1000;

interface DailyTodoSummary {
  id: string;
  text: string;
  completed: boolean;
}

interface DailyData {
  date: string;
  habitRate: number;
  habitCompleted: number;
  habitTotal: number;
  todoCompleted: number;
  todoTotal: number;
  todos: DailyTodoSummary[];
  accomplishments: string;
  went_well: string;
  to_improve: string;
}

interface DashboardData {
  week: string;
  dailyData: DailyData[];
  weeklyGoals: WeeklyGoal[];
  reflection: { went_well: string; to_improve: string } | null;
  warnings?: DashboardWarning[];
}

interface DashboardWarning {
  source: string;
  message: string;
}

interface DashboardLoadError {
  message: string;
  source?: string;
  status?: number;
}

interface RemoteDashboardErrorState extends DashboardLoadError {
  failed_at?: string;
}

function habitRateColor(rate: number) {
  if (rate >= 70) return "text-green-600";
  if (rate >= 40) return "text-amber-600";
  return "text-red-500";
}

function readLocalDashboardData(week: string | null): LocalDailyDashboardData | null {
  try {
    const payload = buildLocalDailyBackupPayloadFromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index) ?? "";
        return [key, localStorage.getItem(key) ?? ""] as [string, string];
      }),
    );
    return buildLocalDailyDashboardData(payload, week);
  } catch {
    return null;
  }
}

function readRemoteErrorState(): RemoteDashboardErrorState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMOTE_ERROR_STATE_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveRemoteErrorState(error: DashboardLoadError) {
  localStorage.setItem(
    REMOTE_ERROR_STATE_KEY,
    JSON.stringify({
      ...error,
      failed_at: new Date().toISOString(),
    }),
  );
}

function clearRemoteErrorState() {
  localStorage.removeItem(REMOTE_ERROR_STATE_KEY);
}

function partialLoadError(data: DashboardData): DashboardLoadError | null {
  const warnings = data.warnings?.filter((warning) => warning.source && warning.message) ?? [];
  if (warnings.length === 0) return null;

  return {
    source: "partial",
    message: warnings.map((warning) => `${warning.source}: ${warning.message}`).join("; "),
  };
}

function isQuotaLoadError(error: DashboardLoadError | null) {
  return Boolean(error?.message && /RESOURCE_EXHAUSTED|quota exceeded|firestore-quota|firestore quota/i.test(error.message));
}

function isRemoteRetryCoolingDown(state: RemoteDashboardErrorState | null) {
  if (!state?.failed_at) return false;
  const failedAt = Date.parse(state.failed_at);
  return Number.isFinite(failedAt) && Date.now() - failedAt < REMOTE_RETRY_MS;
}

function localToDashboardData(local: LocalDailyDashboardData): DashboardData {
  return {
    week: local.week,
    dailyData: local.dailyData,
    weeklyGoals: [],
    reflection: null,
  };
}

function hasLocalDayData(day: DailyData) {
  return day.habitTotal > 0 ||
    day.todoTotal > 0 ||
    Boolean(day.accomplishments || day.went_well || day.to_improve);
}

function mergeDashboardData(
  remote: DashboardData,
  local: LocalDailyDashboardData | null,
  preferLocalWeek: boolean,
): DashboardData {
  if (!local) return remote;

  if (local.week !== remote.week) {
    return preferLocalWeek && local.week > remote.week ? localToDashboardData(local) : remote;
  }

  return {
    ...remote,
    dailyData: remote.dailyData.map((remoteDay) => {
      const localDay = local.dailyData.find((day) => day.date === remoteDay.date);
      if (!localDay || !hasLocalDayData(localDay)) return remoteDay;

      return {
        ...remoteDay,
        habitRate: localDay.habitTotal > 0 ? localDay.habitRate : remoteDay.habitRate,
        habitCompleted: localDay.habitTotal > 0 ? localDay.habitCompleted : remoteDay.habitCompleted,
        habitTotal: localDay.habitTotal > 0 ? localDay.habitTotal : remoteDay.habitTotal,
        todoCompleted: localDay.todoTotal > 0 ? localDay.todoCompleted : remoteDay.todoCompleted,
        todoTotal: localDay.todoTotal > 0 ? localDay.todoTotal : remoteDay.todoTotal,
        todos: localDay.todoTotal > 0 ? localDay.todos : remoteDay.todos,
        accomplishments: localDay.accomplishments || remoteDay.accomplishments,
        went_well: localDay.went_well || remoteDay.went_well,
        to_improve: localDay.to_improve || remoteDay.to_improve,
      };
    }),
  };
}

export function WeeklyDashboard() {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<DashboardLoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [reflectionForm, setReflectionForm] = useState({
    went_well: "",
    to_improve: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const localDashboardData = readLocalDashboardData(week);
    const remoteErrorState = readRemoteErrorState();

    if (localDashboardData && isRemoteRetryCoolingDown(remoteErrorState)) {
      const dashboardData = localToDashboardData(localDashboardData);
      setLoadError({
        message: remoteErrorState?.message ?? "원격 대시보드 재시도 대기 중",
        source: remoteErrorState?.source,
        status: remoteErrorState?.status,
      });
      if (dashboardData.week !== week) setWeek(dashboardData.week);
      setData(dashboardData);
      setReflectionForm({ went_well: "", to_improve: "" });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(week ? `/api/weekly-dashboard?week=${week}` : "/api/weekly-dashboard", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const error = {
          message: typeof json?.error === "string" ? json.error : `HTTP ${res.status}`,
          source: typeof json?.source === "string" ? json.source : undefined,
          status: res.status,
        };
        setLoadError(error);
        saveRemoteErrorState(error);
        if (localDashboardData) {
          const dashboardData = localToDashboardData(localDashboardData);
          if (dashboardData.week !== week) setWeek(dashboardData.week);
          setData(dashboardData);
          setReflectionForm({ went_well: "", to_improve: "" });
        } else {
          setData(null);
        }
        return;
      }
      clearRemoteErrorState();
      const remoteDashboardData = json as DashboardData;
      const dashboardData = mergeDashboardData(remoteDashboardData, localDashboardData, !week);
      const partialError = partialLoadError(remoteDashboardData);
      setLoadError(partialError);
      if (partialError) saveRemoteErrorState(partialError);
      if (dashboardData.week !== week) setWeek(dashboardData.week);
      setData(dashboardData);
      setReflectionForm({
        went_well: dashboardData.reflection?.went_well ?? "",
        to_improve: dashboardData.reflection?.to_improve ?? "",
      });
    } catch (error) {
      const dashboardError = {
        message: error instanceof Error ? error.message : "대시보드 데이터를 불러오지 못했습니다",
      };
      setLoadError(dashboardError);
      saveRemoteErrorState(dashboardError);
      if (localDashboardData) {
        const dashboardData = localToDashboardData(localDashboardData);
        if (dashboardData.week !== week) setWeek(dashboardData.week);
        setData(dashboardData);
        setReflectionForm({ went_well: "", to_improve: "" });
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("idle");
    load();
  }, [load, reloadToken]);

  useEffect(() => {
    const handleLocalBackupSynced = () => {
      setWeek(null);
      setData(null);
      setReloadToken((value) => value + 1);
    };

    window.addEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, handleLocalBackupSynced);
    window.addEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, handleLocalBackupSynced);
    return () => {
      window.removeEventListener(LOCAL_DAILY_BACKUP_CHANGED_EVENT, handleLocalBackupSynced);
      window.removeEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, handleLocalBackupSynced);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  useEffect(() => {
    if (saveStatus !== "idle") {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }, [saveStatus]);

  const saveReflection = useCallback(
    async (form: typeof reflectionForm) => {
      if (!week) return;
      setSaving(true);
      try {
        const res = await fetch("/api/weekly-reflections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week, ...form }),
        });
        if (!res.ok) throw new Error("failed");
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [week]
  );

  const handleReflectionChange = (key: "went_well" | "to_improve", value: string) => {
    const updated = { ...reflectionForm, [key]: value };
    setReflectionForm(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveReflection(updated), 1000);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.dailyData.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            데이터를 불러올 수 없습니다
          </p>
          {loadError && (
            <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left">
              <p className="text-xs font-medium text-destructive">
                {loadError.source ? `${loadError.source} 연결 오류` : "연결 오류"}
                {loadError.status ? ` (${loadError.status})` : ""}
              </p>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                {loadError.message}
              </p>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={load}>
              다시 시도
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/local-daily-backup/status">백업 상태</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { dailyData, weeklyGoals } = data;
  const hasQuotaError = isQuotaLoadError(loadError);

  const rows = [
    { label: "습관 달성률", key: "habitRate" as const },
    { label: "할 일", key: "todos" as const },
    { label: "잘한 일", key: "went_well" as const },
    { label: "보완할 점", key: "to_improve" as const },
    { label: "오늘 한 일", key: "accomplishments" as const },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* 헤더 + 주차 네비게이션 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg lg:text-xl font-bold">주간 대시보드</h2>
        <div className="flex items-center gap-1">
          {loadError && (
            <span className="text-xs lg:text-sm text-amber-600 mr-1">
              {loadError.source === "partial" ? "일부 데이터 누락 가능" : "로컬 백업 표시 중"}
            </span>
          )}
          {saving && (
            <span className="text-xs lg:text-sm text-muted-foreground mr-1">저장 중...</span>
          )}
          {!saving && saveStatus === "saved" && (
            <span className="text-xs lg:text-sm text-green-600 mr-1">저장됨</span>
          )}
          {!saving && saveStatus === "error" && (
            <span className="text-xs lg:text-sm text-red-500 mr-1">저장 실패</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!week}
          onClick={() => week && setWeek(shiftWeek(week, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm lg:text-base font-semibold">
          {week ? formatWeekLabel(week) : "-"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!week}
          onClick={() => week && setWeek(shiftWeek(week, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loadError && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="font-medium">
            {hasQuotaError ? "Firestore 읽기 한도 초과" : "일부 원격 데이터를 불러오지 못했습니다"}
          </div>
          <p className="break-words text-xs leading-relaxed text-amber-900">
            {hasQuotaError
              ? "Firebase read quota가 회복되기 전까지 원격 기록이 비어 보일 수 있습니다. 새 daily 기록은 로컬 백업과 서버 write 경로로 계속 보호됩니다."
              : loadError.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={load}>
              다시 시도
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/local-daily-backup/status">백업 상태</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 주간 표 (가로 스크롤) */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-xs lg:min-w-0 lg:text-base">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-background z-10 p-2 text-left font-medium w-20 min-w-20">
                    &nbsp;
                  </th>
                  {DAY_LABELS.map((day, i) => {
                    const d = dailyData[i];
                    const dateNum = d ? new Date(d.date + "T00:00:00").getDate() : "";
                    return (
                      <th
                        key={day}
                        className="p-2 text-center font-medium min-w-[72px] lg:min-w-[92px]"
                      >
                        <div>{day}</div>
                        <div className="text-[10px] lg:text-xs text-muted-foreground font-normal">
                          {dateNum}일
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0">
                    <td className="sticky left-0 bg-background z-10 p-2 font-medium whitespace-nowrap">
                      {row.label}
                    </td>
                    {dailyData.map((day, i) => (
                      <td key={i} className="p-2 text-center align-top">
                        {row.key === "habitRate" ? (
                          <span className={`font-semibold ${habitRateColor(day.habitRate)}`}>
                            {day.habitRate}%
                          </span>
                        ) : row.key === "todos" ? (
                          day.todoTotal > 0 ? (
                            <div className="space-y-1 text-left">
                              <div className="text-[10px] lg:text-xs font-semibold text-muted-foreground">
                                {day.todoCompleted}/{day.todoTotal} 완료
                              </div>
                              <div className="space-y-0.5">
                                {day.todos.slice(0, 3).map((todo) => (
                                  <div
                                    key={todo.id}
                                    className="flex items-start gap-1.5 text-[11px] lg:text-sm leading-tight text-muted-foreground"
                                  >
                                    {todo.completed ? (
                                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                                    ) : (
                                      <Circle className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                                    )}
                                    <span className={todo.completed ? "line-through" : ""}>
                                      {todo.text}
                                    </span>
                                  </div>
                                ))}
                                {day.todos.length > 3 && (
                                  <div className="text-[10px] lg:text-xs text-muted-foreground">
                                    +{day.todos.length - 3}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px] lg:text-sm">-</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-[11px] lg:text-sm leading-tight block text-left whitespace-pre-line">
                            {day[row.key] || "-"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 하단: 주간 초점 목표 + 주간 회고 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 왼쪽: 이번 주 초점 목표 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm lg:text-base">이번 주 초점 목표</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {weeklyGoals.length === 0 ? (
              <p className="text-xs lg:text-sm text-muted-foreground py-2">
                목표 탭에서 이번 주 목표를 설정해보세요
              </p>
            ) : (
              weeklyGoals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 py-1">
                  {goal.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span
                    className={`text-xs lg:text-sm flex-1 ${goal.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {goal.text}
                  </span>
                  <Badge variant="outline" className="text-[9px] lg:text-xs flex-shrink-0">
                    {PILLAR_LABELS[goal.pillar]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 오른쪽: 주간 회고 (편집 가능) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm lg:text-base">주간 회고</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="space-y-1">
              <label className="text-xs lg:text-sm font-medium text-muted-foreground">
                이번주 잘한 점
              </label>
              <Textarea
                value={reflectionForm.went_well}
                onChange={(e) => handleReflectionChange("went_well", e.target.value)}
                placeholder="이번 주 잘한 점을 적어보세요"
                className="min-h-[60px] text-xs lg:text-sm resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs lg:text-sm font-medium text-muted-foreground">
                다음주 보완할 점
              </label>
              <Textarea
                value={reflectionForm.to_improve}
                onChange={(e) => handleReflectionChange("to_improve", e.target.value)}
                placeholder="다음 주 보완할 점을 적어보세요"
                className="min-h-[60px] text-xs lg:text-sm resize-none"
              />
            </div>
            <Button
              onClick={() => {
                if (saveTimer.current) clearTimeout(saveTimer.current);
                saveReflection(reflectionForm);
              }}
              disabled={saving}
              className="w-full"
              size="sm"
            >
              <Save className="h-3 w-3 mr-1" />
              {saving ? "저장 중..." : "저장하기"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
