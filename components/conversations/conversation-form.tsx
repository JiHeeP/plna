"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const CONTEXT_OPTIONS = ["학교", "스몰토크 수업", "낯선 모임", "온라인", "가족", "친구", "기타"];

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ConversationForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: getTodayString(),
    partner: "",
    context: "",
    summary: "",
    went_well: "",
    to_improve: "",
    new_topic: "",
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partner.trim() && !form.summary.trim()) return;

    setSaving(true);
    const supabase = createClient();

    try {
      // 대화 기록 저장
      const { error } = await supabase.from("conversations").insert({
        date: form.date,
        partner: form.partner,
        context: form.context,
        summary: form.summary,
        went_well: form.went_well,
        to_improve: form.to_improve,
      });

      if (error) throw error;

      // 새 만능대화소재가 있으면 저장
      if (form.new_topic.trim()) {
        await supabase.from("conversation_topics").insert({
          topic: form.new_topic.trim(),
        });
      }

      router.push("/conversations");
      router.refresh();
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">대화 기록 추가</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 날짜 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">날짜</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </div>

          {/* 대화 상대 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">대화 상대</label>
            <Input
              placeholder="누구와 대화했나요?"
              value={form.partner}
              onChange={(e) => update("partner", e.target.value)}
            />
          </div>

          {/* 상황 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">상황</label>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => update("context", opt)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    form.context === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* 요약 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">대화 내용 요약</label>
            <Textarea
              placeholder="어떤 이야기를 나눴나요?"
              value={form.summary}
              onChange={(e) => update("summary", e.target.value)}
              rows={3}
            />
          </div>

          {/* 잘한 점 */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-emerald-600">
              잘한 점
            </label>
            <Textarea
              placeholder="대화에서 잘한 점은?"
              value={form.went_well}
              onChange={(e) => update("went_well", e.target.value)}
              rows={2}
            />
          </div>

          {/* 개선할 점 */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-amber-600">
              개선할 점
            </label>
            <Textarea
              placeholder="다음에 더 잘하려면?"
              value={form.to_improve}
              onChange={(e) => update("to_improve", e.target.value)}
              rows={2}
            />
          </div>

          {/* 새 만능대화소재 */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-blue-600">
              새 만능대화소재 (선택)
            </label>
            <Input
              placeholder="이 대화에서 건진 소재가 있다면?"
              value={form.new_topic}
              onChange={(e) => update("new_topic", e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
