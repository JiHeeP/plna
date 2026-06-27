"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/firebase/client";
import { BookOpen, TrendingUp, Star, Save } from "lucide-react";
import type { DailyJournal } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FIELDS = [
  {
    key: "went_well" as const,
    label: "잘한 일",
    icon: Star,
    placeholder: "오늘 잘한 일은 무엇인가요?",
  },
  {
    key: "to_improve" as const,
    label: "보완하고 싶은 것",
    icon: TrendingUp,
    placeholder: "내일은 어떻게 더 잘할 수 있을까요?",
  },
  {
    key: "accomplishments" as const,
    label: "오늘 한 일",
    icon: BookOpen,
    placeholder: "오늘 무엇을 했나요?",
  },
] as const;

export function DailyJournalCard({ date }: { date?: string }) {
  const [journal, setJournal] = useState<DailyJournal | null>(null);
  const [form, setForm] = useState({
    accomplishments: "",
    to_improve: "",
    went_well: "",
  });
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

  const loadJournal = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const emptyForm = { accomplishments: "", to_improve: "", went_well: "" };

    try {
      const { data, error } = await supabase
        .from("daily_journals")
        .select("*")
        .eq("date", targetDate)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setJournal(data);
        setForm({
          accomplishments: data.accomplishments ?? "",
          to_improve: data.to_improve ?? "",
          went_well: data.went_well ?? "",
        });
      } else {
        setJournal(null);
        setForm(emptyForm);
      }
      setUseLocal(false);
    } catch {
      setUseLocal(true);
      const saved = localStorage.getItem(`journal_${targetDate}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm(parsed);
      } else {
        setJournal(null);
        setForm(emptyForm);
      }
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    // 날짜 전환 시 이전 날짜의 대기 중 저장 타이머 취소
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("idle");
    loadJournal();
  }, [loadJournal]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  // 저장 상태 표시 후 2초 뒤 자동 숨김
  useEffect(() => {
    if (saveStatus !== "idle") {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }, [saveStatus]);

  const saveJournal = useCallback(
    async (updatedForm: typeof form) => {
      setSaving(true);

      if (useLocal) {
        localStorage.setItem(`journal_${targetDate}`, JSON.stringify(updatedForm));
        setSaving(false);
        setSaveStatus("saved");
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("daily_journals")
          .upsert(
            {
              date: targetDate,
              ...updatedForm,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "date" }
          )
          .select()
          .single();

        if (error) throw error;

        if (data) setJournal(data);
        setSaveStatus("saved");
      } catch (err) {
        console.error("저널 저장 실패:", err);
        // Supabase 실패 시 localStorage에 백업 저장
        localStorage.setItem(`journal_${targetDate}`, JSON.stringify(updatedForm));
        setSaveStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [targetDate, useLocal]
  );

  const handleChange = (key: keyof typeof form, value: string) => {
    const updated = { ...form, [key]: value };
    setForm(updated);

    // 자동 저장 (1초 디바운스)
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveJournal(updated), 1000);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
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
          <CardTitle className="text-base lg:text-lg">오늘의 기록</CardTitle>
          {saving && (
            <span className="text-xs text-muted-foreground">저장 중...</span>
          )}
          {!saving && saveStatus === "saved" && (
            <span className="text-xs text-green-600">저장됨</span>
          )}
          {!saving && saveStatus === "error" && (
            <span className="text-xs text-red-500">저장 실패 (로컬에 백업됨)</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm lg:text-base font-medium">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </label>
            <Textarea
              value={form[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="min-h-[72px] text-sm lg:text-base resize-none"
            />
          </div>
        ))}
        <Button
          onClick={() => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveJournal(form);
          }}
          disabled={saving}
          className="w-full"
          size="sm"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "저장 중..." : "저장하기"}
        </Button>
      </CardContent>
    </Card>
  );
}
