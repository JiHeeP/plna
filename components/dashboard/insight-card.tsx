"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type InsightSnapshot = {
  period: "weekly" | "monthly";
  dateRange: { start: string; end: string };
  wentWell: string;
  toImprove: string;
  nextFocus: string;
  metrics: {
    habitCompletionRate: number;
    todoCompletionRate: number;
  };
};

type InsightResponse = {
  weekly: InsightSnapshot | null;
  monthly: InsightSnapshot | null;
};

export function InsightCard() {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [insights, setInsights] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const response = await fetch("/api/insights/latest");
        if (!response.ok) throw new Error("failed");

        const data: InsightResponse = await response.json();
        setInsights(data);
      } catch {
        setInsights({ weekly: null, monthly: null });
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, []);

  const snapshot = insights?.[period] || null;

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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">인사이트</CardTitle>
          <Tabs
            value={period}
            onValueChange={(value) => setPeriod(value as "weekly" | "monthly")}
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
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {snapshot ? (
          <>
            <p className="text-xs text-muted-foreground">
              {snapshot.dateRange.start} ~ {snapshot.dateRange.end}
            </p>
            <section className="space-y-1">
              <h3 className="text-sm font-medium">잘한 점</h3>
              <p className="text-sm text-muted-foreground">{snapshot.wentWell}</p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-medium">보완할 점</h3>
              <p className="text-sm text-muted-foreground">{snapshot.toImprove}</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">핵심 지표</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">습관 달성률</p>
                  <p className="text-base font-semibold">
                    {snapshot.metrics.habitCompletionRate}%
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">할 일 달성률</p>
                  <p className="text-base font-semibold">
                    {snapshot.metrics.todoCompletionRate}%
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-medium">다음달 포커스</h3>
              <p className="text-sm text-muted-foreground">{snapshot.nextFocus}</p>
            </section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-4">
            아직 생성된 인사이트가 없습니다
          </p>
        )}
      </CardContent>
    </Card>
  );
}
