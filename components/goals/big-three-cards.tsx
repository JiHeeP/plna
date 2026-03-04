"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Trophy, MessageCircle, Wallet } from "lucide-react";

interface BigThreeProps {
  topicCount: number;
  milestones: {
    career: { total: number; completed: number };
    identity: { total: number; completed: number };
    assets: { total: number; completed: number };
  };
}

const goals = [
  {
    key: "career" as const,
    label: "1등급",
    subtitle: "연구대회 입상",
    icon: Trophy,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    key: "identity" as const,
    label: "60개",
    subtitle: "만능대화소재",
    icon: MessageCircle,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  {
    key: "assets" as const,
    label: "100만원",
    subtitle: "강의 수익",
    icon: Wallet,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
];

export function BigThreeCards({ topicCount, milestones }: BigThreeProps) {
  const getProgress = (key: string) => {
    if (key === "identity") {
      return { current: topicCount, target: 60, percent: Math.round((topicCount / 60) * 100) };
    }
    const m = milestones[key as keyof typeof milestones];
    return { current: m.completed, target: m.total, percent: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0 };
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">🎯 1-60-100 증명</h2>
      <div className="grid grid-cols-3 gap-2">
        {goals.map((g) => {
          const progress = getProgress(g.key);
          const Icon = g.icon;
          return (
            <Card key={g.key} className={`${g.borderColor} ${g.bgColor} py-3`}>
              <CardContent className="px-3 flex flex-col items-center text-center gap-1">
                <Icon className={`h-6 w-6 ${g.color}`} />
                <div className={`text-xl font-bold ${g.color}`}>{g.label}</div>
                <div className="text-xs text-muted-foreground">{g.subtitle}</div>
                <div className="w-full bg-white/60 rounded-full h-2 mt-1">
                  <div
                    className={`h-2 rounded-full transition-all ${g.color.replace("text-", "bg-")}`}
                    style={{ width: `${Math.min(progress.percent, 100)}%` }}
                  />
                </div>
                <div className="text-xs font-medium">{progress.percent}%</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
