"use client";

import { useEffect, useState, useCallback } from "react";
import { BigThreeCards } from "@/components/goals/big-three-cards";
import { SubGoalOverview } from "@/components/goals/sub-goal-overview";
import { QuarterlyGoalCard } from "@/components/goals/quarterly-goal-card";
import { WeeklyGoalCard } from "@/components/goals/weekly-goal-card";
import { MonthlyGoalCard } from "@/components/goals/monthly-goal-card";
import { MilestoneTimeline } from "@/components/goals/milestone-timeline";
import { NumericTracker } from "@/components/goals/numeric-tracker";
import { Milestone, NumericTarget, NumericLog, SubGoal } from "@/lib/types";

export default function GoalsPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [targets, setTargets] = useState<NumericTarget[]>([]);
  const [logs, setLogs] = useState<NumericLog[]>([]);
  const [subGoals, setSubGoals] = useState<SubGoal[]>([]);
  const [topicCount, setTopicCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/goals", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMilestones(data.milestones ?? []);
      setTargets(data.targets ?? []);
      setLogs(data.logs ?? []);
      setSubGoals(data.subGoals ?? []);
      setTopicCount(data.topicCount ?? 0);
    } catch (e) {
      console.error("목표 데이터 로딩 실패:", e);
      setMilestones([]);
      setTargets([]);
      setLogs([]);
      setSubGoals([]);
      setTopicCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="px-4 pt-6 flex items-center justify-center h-64">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  const getMilestoneStats = (pillar: string) => {
    const pillarMilestones = milestones.filter((m) => m.pillar === pillar);
    return {
      total: pillarMilestones.length,
      completed: pillarMilestones.filter((m) => m.status === "completed").length,
    };
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-6">
      <h1 className="text-2xl font-bold">목표</h1>

      <BigThreeCards
        topicCount={topicCount}
        milestones={{
          career: getMilestoneStats("career"),
          identity: getMilestoneStats("identity"),
          assets: getMilestoneStats("assets"),
        }}
      />

      <SubGoalOverview subGoals={subGoals} onUpdate={fetchData} />

      <QuarterlyGoalCard />

      <WeeklyGoalCard />

      <MonthlyGoalCard />

      <MilestoneTimeline milestones={milestones} onUpdate={fetchData} />

      <NumericTracker targets={targets} logs={logs} onUpdate={fetchData} />
    </div>
  );
}
