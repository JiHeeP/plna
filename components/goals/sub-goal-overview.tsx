"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubGoal, Pillar } from "@/lib/types";
import { PILLAR_TEXT_COLORS } from "@/lib/constants";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Target,
  Calendar,
  Clock,
  Repeat,
} from "lucide-react";
import { PillarBoard } from "./pillar-board";

interface SubGoalOverviewProps {
  subGoals: SubGoal[];
  onUpdate: () => void;
}

const PROGRESS_BG: Record<string, string> = {
  career: "bg-blue-600",
  identity: "bg-emerald-600",
  assets: "bg-amber-600",
};

function SubGoalCard({ sg, onUpdate }: { sg: SubGoal; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [editingRetro, setEditingRetro] = useState(false);
  const [rate, setRate] = useState(sg.achievement_rate);
  const [retro, setRetro] = useState(sg.retrospective ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchField = async (fields: Record<string, unknown>) => {
    const res = await fetch("/api/sub-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sg.id, ...fields }),
    });
    if (!res.ok) {
      console.error("하위목표 수정 실패:", res.status);
      return;
    }
    onUpdate();
  };

  const saveRate = () => {
    const clamped = Math.max(0, Math.min(100, rate));
    setRate(clamped);
    setEditingRate(false);
    patchField({ achievement_rate: clamped });
  };

  const saveRetro = () => {
    setEditingRetro(false);
    patchField({ retrospective: retro || null });
  };

  const autoSaveRetro = (val: string) => {
    setRetro(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      patchField({ retrospective: val || null });
    }, 1500);
  };

  const hasPractice = sg.daily_practice || sg.weekly_practice || sg.monthly_practice;
  const hasTargets = sg.annual_target || sg.quarterly_target || sg.monthly_target;

  return (
    <Card className="bg-white shadow-sm border overflow-hidden">
      <CardContent className="p-3 pl-7 space-y-2">
        {/* Header: name + achievement rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-semibold text-sm ${PILLAR_TEXT_COLORS[sg.pillar]}`}>
              {sg.name}
            </span>
            {sg.positioning && (
              <span className="text-xs text-muted-foreground truncate">
                {sg.positioning}
              </span>
            )}
            {sg.deadline && (
              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                {sg.deadline}
              </Badge>
            )}
            {sg.achievement_rate === 0 && sg.deadline?.includes("정지") && (
              <Badge variant="secondary" className="text-[10px]">정지</Badge>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-1 hover:bg-muted/50 rounded"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Progress bar + rate */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/50 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${PROGRESS_BG[sg.pillar]}`}
              style={{ width: `${Math.min(sg.achievement_rate, 100)}%` }}
            />
          </div>
          {editingRate ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={rate}
                onChange={(e) => setRate(parseInt(e.target.value) || 0)}
                onKeyDown={(e) => e.key === "Enter" && saveRate()}
                className="h-6 w-14 text-xs text-center"
              />
              <button onClick={saveRate}>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </button>
              <button onClick={() => { setEditingRate(false); setRate(sg.achievement_rate); }}>
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingRate(true)}
              className="text-xs font-bold min-w-[3rem] text-right hover:underline"
            >
              {sg.achievement_rate}%
            </button>
          )}
        </div>

        {/* Practice time */}
        {sg.practice_time && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {sg.practice_time}
          </div>
        )}

        {/* Expanded section */}
        {expanded && (
          <div className="space-y-3 pt-1 border-t">
            {/* Targets: annual / quarterly / monthly */}
            {hasTargets && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Target className="h-3 w-3" />
                  목표
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {sg.annual_target && (
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <div className="text-muted-foreground">연간</div>
                      <div className="font-medium">{sg.annual_target}</div>
                    </div>
                  )}
                  {sg.quarterly_target && (
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <div className="text-muted-foreground">분기</div>
                      <div className="font-medium">{sg.quarterly_target}</div>
                    </div>
                  )}
                  {sg.monthly_target && (
                    <div className="bg-muted/30 rounded px-2 py-1">
                      <div className="text-muted-foreground">월간</div>
                      <div className="font-medium">{sg.monthly_target}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Practice items */}
            {hasPractice && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Repeat className="h-3 w-3" />
                  실천
                </div>
                <div className="space-y-0.5 text-xs">
                  {sg.daily_practice && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] px-1">매일</Badge>
                      {sg.daily_practice}
                    </div>
                  )}
                  {sg.weekly_practice && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] px-1">매주</Badge>
                      {sg.weekly_practice}
                    </div>
                  )}
                  {sg.monthly_practice && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] px-1">매달</Badge>
                      {sg.monthly_practice}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Retrospective */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  회고
                </div>
                {!editingRetro && (
                  <button
                    onClick={() => setEditingRetro(true)}
                    className="p-0.5 hover:bg-muted/50 rounded"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              {editingRetro ? (
                <div className="space-y-1">
                  <Textarea
                    value={retro}
                    onChange={(e) => autoSaveRetro(e.target.value)}
                    placeholder="이 하위목표에 대한 회고를 작성하세요..."
                    className="text-xs min-h-[60px] bg-muted/30"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs"
                      onClick={saveRetro}
                    >
                      완료
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {sg.retrospective || "아직 회고가 없습니다."}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SubGoalOverview({ subGoals, onUpdate }: SubGoalOverviewProps) {
  const addSubGoal = async (pillar: Pillar, name: string) => {
    if (!name.trim()) return;
    const res = await fetch("/api/sub-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pillar }),
    });
    if (!res.ok) {
      console.error("하위목표 저장 실패:", res.status);
      return;
    }
    onUpdate();
  };

  const handleReorder = async (items: { id: string; pillar: string; sort_order: number }[]) => {
    const res = await fetch("/api/sub-goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      console.error("재정렬 실패:", res.status);
    }
    onUpdate();
  };

  return (
    <PillarBoard<SubGoal>
      title="하위목표"
      items={subGoals}
      onReorder={handleReorder}
      renderCard={(sg) => <SubGoalCard sg={sg} onUpdate={onUpdate} />}
      renderAddForm={(pillar, onClose) => (
        <AddSubGoalForm
          onSave={(name) => {
            addSubGoal(pillar, name);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    />
  );
}

function AddSubGoalForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="bg-white rounded-lg shadow-sm border p-2 space-y-2">
      <Input
        autoFocus
        placeholder="하위목표 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onSave(name);
          if (e.key === "Escape") onCancel();
        }}
        className="h-8 text-sm"
      />
      <div className="flex justify-end gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => name.trim() && onSave(name)}>
          저장
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
