"use client";

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
import { LOCAL_DAILY_BACKUP_SYNC_EVENT } from "@/lib/local-daily-backup";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Save,
} from "lucide-react";
import type { WeeklyGoal } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

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
}

interface DashboardLoadError {
  message: string;
  source?: string;
  status?: number;
}

function habitRateColor(rate: number) {
  if (rate >= 70) return "text-green-600";
  if (rate >= 40) return "text-amber-600";
  return "text-red-500";
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
    try {
      const res = await fetch(week ? `/api/weekly-dashboard?week=${week}` : "/api/weekly-dashboard", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setData(null);
        setLoadError({
          message: typeof json?.error === "string" ? json.error : `HTTP ${res.status}`,
          source: typeof json?.source === "string" ? json.source : undefined,
          status: res.status,
        });
        return;
      }
      setLoadError(null);
      const dashboardData = json as DashboardData;
      if (dashboardData.week !== week) setWeek(dashboardData.week);
      setData(dashboardData);
      setReflectionForm({
        went_well: dashboardData.reflection?.went_well ?? "",
        to_improve: dashboardData.reflection?.to_improve ?? "",
      });
    } catch (error) {
      setData(null);
      setLoadError({
        message: error instanceof Error ? error.message : "대시보드 데이터를 불러오지 못했습니다",
      });
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

    window.addEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, handleLocalBackupSynced);
    return () => window.removeEventListener(LOCAL_DAILY_BACKUP_SYNC_EVENT, handleLocalBackupSynced);
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
          <Button size="sm" variant="outline" onClick={load}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { dailyData, weeklyGoals } = data;

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
