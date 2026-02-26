"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import type { InsightPayload } from "@/lib/insights";

function confidenceLabel(confidence: InsightPayload["confidence"]) {
  if (confidence === "high") return "신뢰도 높음";
  if (confidence === "medium") return "신뢰도 중간";
  return "신뢰도 낮음";
}

export function InsightCard() {
  const [insight, setInsight] = useState<InsightPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      const data = (await res.json()) as InsightPayload;
      setInsight(data);
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">🧠 AI 인사이트</CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && <div className="text-muted-foreground">인사이트 생성 중...</div>}
        {!loading && !insight && <div className="text-muted-foreground">인사이트를 불러오지 못했습니다.</div>}

        {!loading && insight && (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={insight.status === "ok" ? "default" : "secondary"}>
                {insight.status === "ok" ? "생성 완료" : "데이터 보강 필요"}
              </Badge>
              <Badge variant="outline">{confidenceLabel(insight.confidence)}</Badge>
            </div>

            <p>{insight.summary}</p>

            {insight.causes.length > 0 && (
              <div>
                <div className="font-medium mb-1">원인 가설</div>
                <ul className="list-disc pl-5 space-y-1">
                  {insight.causes.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </div>
            )}

            {insight.actions.length > 0 && (
              <div>
                <div className="font-medium mb-1">다음 행동</div>
                <ul className="list-disc pl-5 space-y-1">
                  {insight.actions.map((action) => (
                    <li key={action.title}>
                      {action.title} (난이도 {action.difficulty}, 기대효과 {action.expectedImpact})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insight.evidence.length > 0 && (
              <div>
                <div className="font-medium mb-1">근거 데이터</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {insight.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {insight.followUpQuestions.length > 0 && (
              <div>
                <div className="font-medium mb-1">추가 입력 요청</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {insight.followUpQuestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
