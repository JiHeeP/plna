"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { BookOpen, NotebookPen, TrendingUp, Star, Save } from "lucide-react";
import { LOCAL_DAILY_BACKUP_CHANGED_EVENT } from "@/lib/local-daily-backup";
import type { DailyDiary, DailyJournal } from "@/lib/types";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const JOURNAL_FIELDS = [
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

type JournalForm = {
  accomplishments: string;
  to_improve: string;
  went_well: string;
};

const EMPTY_JOURNAL_FORM: JournalForm = {
  accomplishments: "",
  to_improve: "",
  went_well: "",
};

function parseStoredJournal(saved: string) {
  try {
    const parsed = JSON.parse(saved) as Partial<JournalForm>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      accomplishments: typeof parsed.accomplishments === "string" ? parsed.accomplishments : "",
      to_improve: typeof parsed.to_improve === "string" ? parsed.to_improve : "",
      went_well: typeof parsed.went_well === "string" ? parsed.went_well : "",
    };
  } catch {
    return null;
  }
}

export function DailyJournalCard({ date }: { date?: string }) {
  const [journalForm, setJournalForm] = useState<JournalForm>(EMPTY_JOURNAL_FORM);
  const [diaryContent, setDiaryContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [useJournalLocal, setUseJournalLocal] = useState(false);
  const [useDiaryLocal, setUseDiaryLocal] = useState(false);
  const [journalSaving, setJournalSaving] = useState(false);
  const [diarySaving, setDiarySaving] = useState(false);
  const [journalSaveStatus, setJournalSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [diarySaveStatus, setDiarySaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const journalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diarySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const journalStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diaryStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetDate = useMemo(() => date ?? toDateString(new Date()), [date]);

  const saveLocalJournal = useCallback(
    (updatedForm: JournalForm, notify = true) => {
      localStorage.setItem(`journal_${targetDate}`, JSON.stringify(updatedForm));
      localStorage.removeItem(`diary_${targetDate}`);
      if (notify) {
        window.dispatchEvent(new CustomEvent(LOCAL_DAILY_BACKUP_CHANGED_EVENT));
      }
    },
    [targetDate],
  );

  const saveLocalDiary = useCallback(
    (content: string) => {
      localStorage.setItem(`diary_note_${targetDate}`, content);
    },
    [targetDate],
  );

  const readLocalJournal = useCallback(() => {
    const saved = localStorage.getItem(`journal_${targetDate}`);
    if (saved) return parseStoredJournal(saved);

    const mistakenDiarySaved = localStorage.getItem(`diary_${targetDate}`);
    if (!mistakenDiarySaved) return null;

    const migratedForm = parseStoredJournal(mistakenDiarySaved);
    if (migratedForm) {
      saveLocalJournal(migratedForm, false);
    }
    return migratedForm;
  }, [saveLocalJournal, targetDate]);

  const readLocalDiary = useCallback(() => {
    const saved = localStorage.getItem(`diary_note_${targetDate}`);
    return saved ?? null;
  }, [targetDate]);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/journal?date=${encodeURIComponent(targetDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as DailyJournal | null;
      const localForm = readLocalJournal();
      if (localForm !== null) {
        setJournalForm(localForm);
      } else if (data) {
        const remoteForm = {
          accomplishments: data.accomplishments ?? "",
          to_improve: data.to_improve ?? "",
          went_well: data.went_well ?? "",
        };
        setJournalForm(remoteForm);
        if (remoteForm.accomplishments || remoteForm.to_improve || remoteForm.went_well) {
          saveLocalJournal(remoteForm, false);
        }
      } else {
        setJournalForm(EMPTY_JOURNAL_FORM);
      }
      setUseJournalLocal(false);
    } catch {
      setUseJournalLocal(true);
      setJournalForm(readLocalJournal() ?? EMPTY_JOURNAL_FORM);
    }

    try {
      const response = await fetch(`/api/diary?date=${encodeURIComponent(targetDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as DailyDiary | null;
      const localContent = readLocalDiary();
      if (localContent !== null) {
        setDiaryContent(localContent);
      } else {
        const remoteContent = data?.content ?? "";
        setDiaryContent(remoteContent);
        if (remoteContent) {
          saveLocalDiary(remoteContent);
        }
      }
      setUseDiaryLocal(false);
    } catch {
      setUseDiaryLocal(true);
      setDiaryContent(readLocalDiary() ?? "");
    } finally {
      setLoading(false);
    }
  }, [readLocalDiary, readLocalJournal, saveLocalDiary, saveLocalJournal, targetDate]);

  useEffect(() => {
    if (journalSaveTimer.current) clearTimeout(journalSaveTimer.current);
    if (diarySaveTimer.current) clearTimeout(diarySaveTimer.current);
    setJournalSaveStatus("idle");
    setDiarySaveStatus("idle");
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (journalSaveTimer.current) clearTimeout(journalSaveTimer.current);
      if (diarySaveTimer.current) clearTimeout(diarySaveTimer.current);
      if (journalStatusTimer.current) clearTimeout(journalStatusTimer.current);
      if (diaryStatusTimer.current) clearTimeout(diaryStatusTimer.current);
    };
  }, []);

  useEffect(() => {
    if (journalSaveStatus !== "idle") {
      if (journalStatusTimer.current) clearTimeout(journalStatusTimer.current);
      journalStatusTimer.current = setTimeout(() => setJournalSaveStatus("idle"), 2000);
    }
  }, [journalSaveStatus]);

  useEffect(() => {
    if (diarySaveStatus !== "idle") {
      if (diaryStatusTimer.current) clearTimeout(diaryStatusTimer.current);
      diaryStatusTimer.current = setTimeout(() => setDiarySaveStatus("idle"), 2000);
    }
  }, [diarySaveStatus]);

  const saveJournal = useCallback(
    async (updatedForm: JournalForm) => {
      setJournalSaving(true);
      saveLocalJournal(updatedForm, false);

      if (useJournalLocal) {
        saveLocalJournal(updatedForm);
        setJournalSaving(false);
        setJournalSaveStatus("saved");
        return;
      }

      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: targetDate,
            ...updatedForm,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        saveLocalJournal(updatedForm);
        setJournalSaveStatus("saved");
      } catch (err) {
        console.error("저널 저장 실패:", err);
        setUseJournalLocal(true);
        saveLocalJournal(updatedForm);
        setJournalSaveStatus("error");
      } finally {
        setJournalSaving(false);
      }
    },
    [saveLocalJournal, targetDate, useJournalLocal],
  );

  const saveDiary = useCallback(
    async (content: string) => {
      setDiarySaving(true);
      saveLocalDiary(content);

      if (useDiaryLocal) {
        setDiarySaving(false);
        setDiarySaveStatus("saved");
        return;
      }

      try {
        const response = await fetch("/api/diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: targetDate,
            content,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        saveLocalDiary(content);
        setDiarySaveStatus("saved");
      } catch (err) {
        console.error("일기 저장 실패:", err);
        setUseDiaryLocal(true);
        saveLocalDiary(content);
        setDiarySaveStatus("error");
      } finally {
        setDiarySaving(false);
      }
    },
    [saveLocalDiary, targetDate, useDiaryLocal],
  );

  const handleJournalChange = (key: keyof JournalForm, value: string) => {
    const updated = { ...journalForm, [key]: value };
    setJournalForm(updated);
    saveLocalJournal(updated, false);

    if (journalSaveTimer.current) clearTimeout(journalSaveTimer.current);
    journalSaveTimer.current = setTimeout(() => saveJournal(updated), 1000);
  };

  const handleDiaryChange = (value: string) => {
    setDiaryContent(value);
    saveLocalDiary(value);

    if (diarySaveTimer.current) clearTimeout(diarySaveTimer.current);
    diarySaveTimer.current = setTimeout(() => saveDiary(value), 1000);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
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
          {journalSaving && (
            <span className="text-xs text-muted-foreground">저장 중...</span>
          )}
          {!journalSaving && journalSaveStatus === "saved" && (
            <span className="text-xs text-green-600">저장됨</span>
          )}
          {!journalSaving && journalSaveStatus === "error" && (
            <span className="text-xs text-red-500">저장 실패 (로컬에 백업됨)</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {JOURNAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm lg:text-base font-medium">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </label>
            <Textarea
              value={journalForm[key]}
              onChange={(e) => handleJournalChange(key, e.target.value)}
              placeholder={placeholder}
              className="min-h-[72px] text-sm lg:text-base resize-none"
            />
          </div>
        ))}
        <Button
          onClick={() => {
            if (journalSaveTimer.current) clearTimeout(journalSaveTimer.current);
            saveJournal(journalForm);
          }}
          disabled={journalSaving}
          className="w-full"
          size="sm"
        >
          <Save className="h-4 w-4 mr-2" />
          {journalSaving ? "저장 중..." : "기록 저장하기"}
        </Button>

        <div className="border-t pt-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm lg:text-base font-medium">
              <NotebookPen className="h-4 w-4 text-muted-foreground" />
              오늘의 일기
            </label>
            {diarySaving && (
              <span className="text-xs text-muted-foreground">저장 중...</span>
            )}
            {!diarySaving && diarySaveStatus === "saved" && (
              <span className="text-xs text-green-600">저장됨</span>
            )}
            {!diarySaving && diarySaveStatus === "error" && (
              <span className="text-xs text-red-500">저장 실패 (기기에 보관됨)</span>
            )}
          </div>
          <Textarea
            value={diaryContent}
            onChange={(e) => handleDiaryChange(e.target.value)}
            placeholder="대시보드와 분리해서 남길 오늘의 일기를 적어보세요."
            className="min-h-[120px] text-sm lg:text-base resize-none"
          />
          <Button
            onClick={() => {
              if (diarySaveTimer.current) clearTimeout(diarySaveTimer.current);
              saveDiary(diaryContent);
            }}
            disabled={diarySaving}
            className="w-full"
            size="sm"
            variant="outline"
          >
            <Save className="h-4 w-4 mr-2" />
            {diarySaving ? "저장 중..." : "일기 저장하기"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
