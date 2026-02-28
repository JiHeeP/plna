"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { UnifiedInsightSnapshot, UnifiedInsightResponse } from "@/lib/insights";

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span
      className={`ml-1 text-xs font-medium ${isUp ? "text-green-600" : "text-red-500"}`}
    >
      {isUp ? "\u2191" : "\u2193"}
      {Math.abs(value)}%p
    </span>
  );
}

function PointList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal list-inside space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-muted-foreground">
          {item}
        </li>
      ))}
    </ol>
  );
}

export function InsightCard() {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [insights, setInsights] = useState<UnifiedInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data: UnifiedInsightResponse = await res.json();
      setInsights(data);
      setHasLoaded(true);
    } catch {
      setInsights({ weekly: null, monthly: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const snapshot: UnifiedInsightSnapshot | null = insights?.[period] ?? null;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">AI 인사이트</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs
              value={period}
              onValueChange={(v) => setPeriod(v as "weekly" | "monthly")}
            >
              <TabsList className="h-8">
                <TabsTrigger value="weekly" className="text-xs px-3 h-7">
                  주간
                </TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs px-3 h-7">
                  월간
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              새로고침
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {snapshot ? (
          <>
            <p className="text-xs text-muted-foreground">
              {snapshot.dateRange.start} ~ {snapshot.dateRange.end}
            </p>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">잘한 점</h3>
              <PointList items={snapshot.wentWell} />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">보완할 점</h3>
              <PointList items={snapshot.toImprove} />
            </section>

            {snapshot.surpriseInsight && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">의외의 발견</h3>
                <p className="text-sm text-muted-foreground">
                  {snapshot.surpriseInsight}
                </p>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">핵심 지표</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">습관 달성률</p>
                  <p className="text-base font-semibold">
                    {snapshot.metrics.habitCompletionRate}%
                    <TrendBadge value={snapshot.metrics.habitTrend} />
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">할 일 달성률</p>
                  <p className="text-base font-semibold">
                    {snapshot.metrics.todoCompletionRate}%
                    <TrendBadge value={snapshot.metrics.todoTrend} />
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">다음 포커스</h3>
              <PointList items={snapshot.nextFocus} />
            </section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            {hasLoaded
              ? "아직 생성된 인사이트가 없습니다"
              : "새로고침을 눌러 AI 인사이트를 불러오세요"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
