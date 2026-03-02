"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  getISOWeekString,
  shiftWeek,
  formatWeekLabel,
} from "@/lib/utils";
import { PILLAR_LABELS } from "@/lib/constants";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Save,
} from "lucide-react";
import type { WeeklyGoal } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

interface DailyData {
  date: string;
  habitRate: number;
  habitCompleted: number;
  habitTotal: number;
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

function habitRateColor(rate: number) {
  if (rate >= 70) return "text-green-600";
  if (rate >= 40) return "text-amber-600";
  return "text-red-500";
}

function truncate(text: string, max: number) {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export function WeeklyDashboard() {
  const [week, setWeek] = useState(() => getISOWeekString(new Date()));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
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
      const res = await fetch(`/api/weekly-dashboard?week=${week}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("failed");
      const json: DashboardData = await res.json();
      setData(json);
      setReflectionForm({
        went_well: json.reflection?.went_well ?? "",
        to_improve: json.reflection?.to_improve ?? "",
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("idle");
    load();
  }, [load]);

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
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            데이터를 불러올 수 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  const { dailyData, weeklyGoals } = data;

  const rows = [
    { label: "습관 달성률", key: "habitRate" as const },
    { label: "오늘 한 일", key: "accomplishments" as const },
    { label: "잘한 일", key: "went_well" as const },
    { label: "보완할 점", key: "to_improve" as const },
  ];

  return (
    <div className="space-y-4">
      {/* 헤더 + 주차 네비게이션 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">주간 대시보드</h2>
        <div className="flex items-center gap-1">
          {saving && (
            <span className="text-xs text-muted-foreground mr-1">저장 중...</span>
          )}
          {!saving && saveStatus === "saved" && (
            <span className="text-xs text-green-600 mr-1">저장됨</span>
          )}
          {!saving && saveStatus === "error" && (
            <span className="text-xs text-red-500 mr-1">저장 실패</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setWeek((w) => shiftWeek(w, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{formatWeekLabel(week)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setWeek((w) => shiftWeek(w, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 주간 표 (가로 스크롤) */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-xs">
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
                        className="p-2 text-center font-medium min-w-[72px]"
                      >
                        <div>{day}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
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
                        ) : (
                          <span className="text-muted-foreground text-[11px] leading-tight block text-left">
                            {truncate(day[row.key], 40)}
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
            <CardTitle className="text-sm">이번 주 초점 목표</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {weeklyGoals.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
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
                    className={`text-xs flex-1 ${goal.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {goal.text}
                  </span>
                  <Badge variant="outline" className="text-[9px] flex-shrink-0">
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
            <CardTitle className="text-sm">주간 회고</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                이번주 잘한 점
              </label>
              <Textarea
                value={reflectionForm.went_well}
                onChange={(e) => handleReflectionChange("went_well", e.target.value)}
                placeholder="이번 주 잘한 점을 적어보세요"
                className="min-h-[60px] text-xs resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                다음주 보완할 점
              </label>
              <Textarea
                value={reflectionForm.to_improve}
                onChange={(e) => handleReflectionChange("to_improve", e.target.value)}
                placeholder="다음 주 보완할 점을 적어보세요"
                className="min-h-[60px] text-xs resize-none"
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
