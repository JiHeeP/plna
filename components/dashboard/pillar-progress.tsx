"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PILLAR_LABELS, PILLAR_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Milestone, Pillar } from "@/lib/types";

interface PillarData {
  pillar: Pillar;
  total: number;
  completed: number;
  inProgress: number;
}

export function PillarProgress() {
  const [pillars, setPillars] = useState<PillarData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/goals", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as { milestones: Milestone[] };
        const milestones = data.milestones.filter((milestone) =>
          ["6month", "1year"].includes(milestone.timeframe),
        );

        if (!milestones) {
          setLoading(false);
          return;
        }

        const pillarMap: Record<string, PillarData> = {};
        (["career", "identity", "assets"] as Pillar[]).forEach((p) => {
          pillarMap[p] = { pillar: p, total: 0, completed: 0, inProgress: 0 };
        });

        milestones.forEach((m) => {
          const pd = pillarMap[m.pillar];
          if (pd) {
            pd.total++;
            if (m.status === "completed") pd.completed++;
            if (m.status === "in_progress") pd.inProgress++;
          }
        });

        setPillars(Object.values(pillarMap));
      } catch {
        // 기본값
        setPillars(
          (["career", "identity", "assets"] as Pillar[]).map((p) => ({
            pillar: p,
            total: 1,
            completed: 0,
            inProgress: 0,
          }))
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg">3대 축 진행률</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pillars.map((p) => {
          const percentage =
            p.total > 0
              ? Math.round(
                  ((p.completed + p.inProgress * 0.3) / p.total) * 100
                )
              : 0;

          return (
            <div key={p.pillar} className="space-y-1">
              <div className="flex justify-between text-sm lg:text-base">
                <span className="font-medium">
                  {PILLAR_LABELS[p.pillar]}
                </span>
                <span className="text-muted-foreground">{percentage}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    PILLAR_COLORS[p.pillar]
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
