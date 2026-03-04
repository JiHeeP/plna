"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X, ChevronDown, ChevronUp, Save } from "lucide-react";
import type { ConversationTopic } from "@/lib/types";

const TARGET = 60;

export function TopicManager() {
  const [topics, setTopics] = useState<ConversationTopic[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/topics", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as ConversationTopic[];
      setTopics(data ?? []);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "알 수 없는 오류";
      setError(`불러오기 실패: ${message}`);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const addTopic = async () => {
    const topicText = newTopic.trim();
    if (!topicText) return;

    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicText, content: "" }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const created = (await response.json()) as ConversationTopic;
      setTopics((prev) => [created, ...prev]);
      setNewTopic("");
      setError(null);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "알 수 없는 오류";
      setError(`추가 실패: ${message}`);
    }
  };

  const deleteTopic = async (id: string) => {
    try {
      const response = await fetch(`/api/topics?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setTopics((prev) => prev.filter((topic) => topic.id !== id));
      if (expandedId === id) setExpandedId(null);
      setError(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "알 수 없는 오류";
      setError(`삭제 실패: ${message}`);
    }
  };

  const saveContent = async (id: string) => {
    try {
      const response = await fetch("/api/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editContent }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setTopics((prev) =>
        prev.map((topic) =>
          topic.id === id ? { ...topic, content: editContent } : topic
        )
      );
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "알 수 없는 오류";
      setError(`저장 실패: ${message}`);
    }
  };

  const toggleExpand = (topic: ConversationTopic) => {
    if (expandedId === topic.id) {
      setExpandedId(null);
    } else {
      setExpandedId(topic.id);
      setEditContent(topic.content || "");
    }
  };

  const count = topics.length;
  const percentage = Math.round((count / TARGET) * 100);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">만능대화소재</span>
            <span className="text-sm font-bold">
              {count}/{TARGET}개 ({percentage}%)
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Input
          placeholder="새 만능대화소재 입력..."
          value={newTopic}
          onChange={(event) => setNewTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTopic();
            }
          }}
        />
        <Button size="icon" onClick={addTopic} disabled={!newTopic.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">소재 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : topics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              아직 소재가 없습니다. 위에서 추가해보세요!
            </p>
          ) : (
            <ul className="space-y-1">
              {topics.map((topic) => {
                const isExpanded = expandedId === topic.id;
                return (
                  <li key={topic.id} className="rounded-lg border">
                    <div className="flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 transition-colors">
                      <button
                        onClick={() => toggleExpand(topic)}
                        className="flex items-start gap-2 flex-1 text-left min-w-0"
                      >
                        <span className="mt-0.5 shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium break-words">
                            {topic.topic}
                          </span>
                          {topic.content && !isExpanded && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {topic.content}
                            </p>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => deleteTopic(topic.id)}
                        className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2">
                        <Textarea
                          placeholder="이 소재에 대한 메모, 예시 문장, 경험 등을 적어보세요..."
                          value={editContent}
                          onChange={(event) => setEditContent(event.target.value)}
                          rows={4}
                          className="text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveContent(topic.id)}
                          className="w-full"
                        >
                          <Save className="h-3.5 w-3.5 mr-1" />
                          저장
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
