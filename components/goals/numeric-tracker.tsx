"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericTarget, NumericLog } from "@/lib/types";
import { Gem, Plus, Users, Wallet, type LucideIcon } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";

/** 카드 순서대로 파랑·초록·주황. 예전 1-60-100 카드와 같은 톤. */
const CARD_STYLES: {
  icon: LucideIcon;
  color: string;
  bar: string;
  stroke: string;
  bgColor: string;
  borderColor: string;
  ring: string;
}[] = [
  { icon: Users, color: "text-blue-600", bar: "bg-blue-600", stroke: "#2563eb", bgColor: "bg-blue-50", borderColor: "border-blue-200", ring: "ring-blue-400" },
  { icon: Wallet, color: "text-emerald-600", bar: "bg-emerald-600", stroke: "#059669", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", ring: "ring-emerald-400" },
  { icon: Gem, color: "text-amber-600", bar: "bg-amber-600", stroke: "#d97706", bgColor: "bg-amber-50", borderColor: "border-amber-200", ring: "ring-amber-400" },
];

interface NumericTrackerProps {
  targets: NumericTarget[];
  logs: NumericLog[];
  onUpdate: () => void;
}

export function NumericTracker({ targets, logs, onUpdate }: NumericTrackerProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const addLog = async (targetId: string) => {
    if (!newValue.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "numeric_log",
          target_id: targetId,
          date: new Date().toISOString().split("T")[0],
          value: parseFloat(newValue),
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setNewValue("");
      setSelectedTarget(null);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const getLatestValue = (targetId: string) => {
    const targetLogs = logs
      .filter((l) => l.target_id === targetId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return targetLogs[0]?.value ?? 0;
  };

  const getChartData = (targetId: string) => {
    return logs
      .filter((l) => l.target_id === targetId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({
        date: format(parseISO(l.date), "M/d"),
        value: l.value,
      }));
  };

  const selectedIndex = targets.findIndex((t) => t.id === selectedTarget);
  const selected = selectedIndex >= 0 ? targets[selectedIndex] : null;
  const selectedStyle = CARD_STYLES[selectedIndex % CARD_STYLES.length];
  const chartData = selected ? getChartData(selected.id) : [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">🎯 수치 목표</h2>
      <div className="grid grid-cols-3 gap-2">
        {targets.map((t, i) => {
          const style = CARD_STYLES[i % CARD_STYLES.length];
          const Icon = style.icon;
          const latest = getLatestValue(t.id);
          const percent = t.target_value > 0 ? Math.round((latest / t.target_value) * 100) : 0;
          const isSelected = selectedTarget === t.id;

          return (
            <button
              key={t.id}
              type="button"
              className="text-left"
              onClick={() => {
                setSelectedTarget(isSelected ? null : t.id);
                setNewValue("");
              }}
            >
              <Card
                className={`${style.borderColor} ${style.bgColor} py-3 h-full ${
                  isSelected ? `ring-2 ${style.ring}` : ""
                }`}
              >
                <CardContent className="px-3 flex flex-col items-center text-center gap-1">
                  <Icon className={`h-6 w-6 ${style.color}`} />
                  <div className={`text-lg sm:text-xl font-bold whitespace-nowrap ${style.color}`}>
                    {t.target_value.toLocaleString()}
                    {t.unit}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.name}</div>
                  <div className="w-full bg-white/60 rounded-full h-2 mt-1">
                    <div
                      className={`h-2 rounded-full transition-all ${style.bar}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs font-medium">
                    {latest.toLocaleString()}
                    {t.unit} · {percent}%
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {selected && (
        <Card className={`${selectedStyle.borderColor} py-3`}>
          <CardContent className="px-4 space-y-3">
            <div className="text-sm font-medium">{selected.name} 기록</div>
            {chartData.length > 1 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id={`gradient-${selected.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={selectedStyle.stroke} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={selectedStyle.stroke} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={35} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={selectedStyle.stroke}
                      fill={`url(#gradient-${selected.id})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-2">
                데이터를 2개 이상 기록하면 그래프가 나타납니다
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={`현재 ${selected.unit}`}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newValue.trim() && !saving) addLog(selected.id);
                }}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => addLog(selected.id)}
                disabled={saving || !newValue.trim()}
              >
                <Plus className="h-4 w-4" />
                기록
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
