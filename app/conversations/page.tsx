"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationCard } from "@/components/conversations/conversation-card";
import { TopicManager } from "@/components/conversations/topic-manager";
import { Plus, Search } from "lucide-react";
import type { Conversation } from "@/lib/types";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [monthCount, setMonthCount] = useState(0);

  const loadConversations = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const queryString = params.toString();
      const url = queryString
        ? `/api/conversations?${queryString}`
        : "/api/conversations";

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as Conversation[];
      const list = data ?? [];
      setConversations(list);

      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const thisMonth = list.filter((conversation) =>
        conversation.date.startsWith(monthStr)
      );
      setMonthCount(thisMonth.length);
    } catch {
      setConversations([]);
      setMonthCount(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">대화</h1>
        <Link href="/conversations/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            기록
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="log" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="log" className="flex-1">
            기록
          </TabsTrigger>
          <TabsTrigger value="topics" className="flex-1">
            소재
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-3">
          <div className="text-center py-2 rounded-lg bg-accent/50">
            <span className="text-sm text-muted-foreground">
              이번 달 <span className="font-bold text-foreground">{monthCount}회</span> 대화 기록
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="대화 검색..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-20 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-3">
                {search ? "검색 결과가 없습니다" : "아직 대화 기록이 없습니다"}
              </p>
              {!search && (
                <Link href="/conversations/new">
                  <Button variant="outline" size="sm">
                    첫 대화 기록하기
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <ConversationCard key={conversation.id} conversation={conversation} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="topics">
          <TopicManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
