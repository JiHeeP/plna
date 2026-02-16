"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericTarget, NumericLog } from "@/lib/types";
import { Plus, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";

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
    const supabase = createClient();
    await supabase.from("numeric_logs").insert({
      target_id: targetId,
      date: new Date().toISOString().split("T")[0],
      value: parseFloat(newValue),
    });
    setNewValue("");
    setSelectedTarget(null);
    setSaving(false);
    onUpdate();
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

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">📊 수치 추적</h2>
      {targets.map((t) => {
        const latest = getLatestValue(t.id);
        const percent = Math.round((latest / t.target_value) * 100);
        const chartData = getChartData(t.id);
        const isSelected = selectedTarget === t.id;

        return (
          <Card key={t.id} className="py-3">
            <CardContent className="px-4 space-y-2">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setSelectedTarget(isSelected ? null : t.id)}
              >
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    목표: {t.target_value}{t.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    {latest}<span className="text-xs text-muted-foreground ml-0.5">{t.unit}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{percent}%</div>
                </div>
              </button>

              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>

              {isSelected && (
                <div className="pt-2 space-y-3">
                  {/* Chart */}
                  {chartData.length > 1 && (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id={`gradient-${t.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={35} />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            fill={`url(#gradient-${t.id})`}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {chartData.length <= 1 && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      데이터를 2개 이상 기록하면 그래프가 나타납니다
                    </div>
                  )}

                  {/* Add value */}
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder={`현재 ${t.unit}`}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => addLog(t.id)}
                      disabled={saving || !newValue.trim()}
                    >
                      <Plus className="h-4 w-4" />
                      기록
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
