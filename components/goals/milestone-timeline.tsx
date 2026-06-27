"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Milestone } from "@/lib/types";
import { PILLAR_LABELS } from "@/lib/constants";
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp } from "lucide-react";

const TIMEFRAME_LABELS: Record<string, string> = {
  "6month": "6개월",
  "1year": "1년",
  "3year": "3년",
  "5year": "5년",
  "10year": "10년",
};

const STATUS_CONFIG = {
  completed: { icon: CheckCircle2, color: "text-green-600", label: "완료" },
  in_progress: { icon: Clock, color: "text-blue-600", label: "진행중" },
  not_started: { icon: Circle, color: "text-gray-400", label: "미시작" },
  abandoned: { icon: Circle, color: "text-red-400", label: "중단" },
};

interface MilestoneTimelineProps {
  milestones: Milestone[];
  onUpdate: () => void;
}

export function MilestoneTimeline({ milestones, onUpdate }: MilestoneTimelineProps) {
  const [expandedTimeframe, setExpandedTimeframe] = useState<string>("6month");

  const grouped = milestones.reduce<Record<string, Milestone[]>>((acc, m) => {
    if (!acc[m.timeframe]) acc[m.timeframe] = [];
    acc[m.timeframe].push(m);
    return acc;
  }, {});

  const timeframes = ["6month", "1year", "3year", "5year", "10year"];

  const cycleStatus = async (milestone: Milestone) => {
    const order: Milestone["status"][] = ["not_started", "in_progress", "completed"];
    const currentIdx = order.indexOf(milestone.status);
    const nextStatus = order[(currentIdx + 1) % order.length];

    const response = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "milestone",
        id: milestone.id,
        status: nextStatus,
      }),
    });

    if (!response.ok) return;
    onUpdate();
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">📍 이정표</h2>
      {timeframes.map((tf) => {
        const items = grouped[tf] || [];
        if (items.length === 0) return null;
        const isExpanded = expandedTimeframe === tf;
        const completedCount = items.filter((m) => m.status === "completed").length;

        return (
          <Card key={tf} className="py-0 overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center justify-between"
              onClick={() => setExpandedTimeframe(isExpanded ? "" : tf)}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{TIMEFRAME_LABELS[tf]}</span>
                <Badge variant="secondary" className="text-xs">
                  {completedCount}/{items.length}
                </Badge>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isExpanded && (
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {items.map((m) => {
                  const config = STATUS_CONFIG[m.status];
                  const StatusIcon = config.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => cycleStatus(m)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <StatusIcon className={`h-5 w-5 flex-shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${m.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {m.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {PILLAR_LABELS[m.pillar]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
