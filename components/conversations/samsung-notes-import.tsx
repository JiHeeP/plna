"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/firebase/client";
import { Upload, FileText, Check } from "lucide-react";

interface ParsedEntry {
  date: string;
  content: string;
  selected: boolean;
}

function parseNotes(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // 다양한 날짜 패턴 매칭
  const datePatterns = [
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g,
  ];

  // 모든 날짜 위치 찾기
  const datePositions: { index: number; date: string }[] = [];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const y = match[1];
      const m = match[2].padStart(2, "0");
      const d = match[3].padStart(2, "0");
      datePositions.push({
        index: match.index,
        date: `${y}-${m}-${d}`,
      });
    }
  }

  // 날짜 순으로 정렬
  datePositions.sort((a, b) => a.index - b.index);

  // 날짜 사이의 텍스트를 추출
  for (let i = 0; i < datePositions.length; i++) {
    const start = datePositions[i].index;
    const end =
      i + 1 < datePositions.length ? datePositions[i + 1].index : text.length;

    const content = text
      .slice(start, end)
      .replace(/^\d{4}[년.\-/]\s*\d{1,2}[월.\-/]\s*\d{1,2}[일]?\s*/, "")
      .trim();

    if (content) {
      entries.push({
        date: datePositions[i].date,
        content,
        selected: true,
      });
    }
  }

  // 날짜 패턴이 없으면 전체를 하나의 항목으로
  if (entries.length === 0 && text.trim()) {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    entries.push({
      date: dateStr,
      content: text.trim(),
      selected: true,
    });
  }

  return entries;
}

export function SamsungNotesImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedEntry[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [saving, setSaving] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
      setParsed(parseNotes(text));
      setStep("preview");
    };
    reader.readAsText(file, "utf-8");
  };

  const handlePaste = () => {
    if (!rawText.trim()) return;
    setParsed(parseNotes(rawText));
    setStep("preview");
  };

  const toggleEntry = (index: number) => {
    setParsed((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, selected: !e.selected } : e
      )
    );
  };

  const handleImport = async () => {
    const selected = parsed.filter((e) => e.selected);
    if (selected.length === 0) return;

    setSaving(true);
    const supabase = createClient();

    try {
      const rows = selected.map((e) => ({
        date: e.date,
        partner: "",
        context: "삼성노트",
        summary: e.content,
        went_well: "",
        to_improve: "",
        is_imported: true,
        source_text: e.content,
      }));

      const { error } = await supabase.from("conversations").insert(rows);
      if (error) throw error;

      setStep("done");
      setTimeout(() => {
        router.push("/conversations");
        router.refresh();
      }, 1500);
    } catch (err) {
      console.error("가져오기 실패:", err);
      alert("가져오기에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "done") {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Check className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-medium">가져오기 완료!</p>
          <p className="text-sm text-muted-foreground">대화 목록으로 이동합니다...</p>
        </CardContent>
      </Card>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {parsed.length}개 항목을 찾았습니다
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {parsed.map((entry, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  entry.selected ? "bg-accent border-primary/30" : "opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={entry.selected}
                  onChange={() => toggleEntry(i)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {entry.date}
                  </p>
                  <p className="text-sm line-clamp-3">{entry.content}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setStep("input");
              setParsed([]);
            }}
          >
            다시 선택
          </Button>
          <Button
            className="flex-1"
            onClick={handleImport}
            disabled={saving || parsed.filter((e) => e.selected).length === 0}
          >
            {saving
              ? "저장 중..."
              : `${parsed.filter((e) => e.selected).length}개 가져오기`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 파일 업로드 */}
      <Card
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <CardContent className="py-8 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="font-medium text-sm">삼성노트 .txt 파일 업로드</p>
          <p className="text-xs text-muted-foreground mt-1">
            삼성노트 → 공유 → 텍스트 파일로 내보낸 파일
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.text"
            onChange={handleFile}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* 또는 직접 붙여넣기 */}
      <div className="text-center text-xs text-muted-foreground">또는</div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            직접 붙여넣기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="삼성노트 내용을 여기에 붙여넣으세요..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
          />
          <Button
            onClick={handlePaste}
            disabled={!rawText.trim()}
            className="w-full"
          >
            분석하기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
