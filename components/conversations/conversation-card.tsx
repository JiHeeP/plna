"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Conversation } from "@/lib/types";

interface Props {
  conversation: Conversation;
}

export function ConversationCard({ conversation }: Props) {
  const dateObj = new Date(conversation.date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${dayNames[dateObj.getDay()]})`;

  return (
    <Card className="hover:bg-accent/50 transition-colors">
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{conversation.partner || "(이름 없음)"}</span>
              {conversation.context && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {conversation.context}
                </Badge>
              )}
            </div>
            {conversation.summary && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {conversation.summary}
              </p>
            )}
            <div className="flex gap-3 mt-1.5">
              {conversation.went_well && (
                <span className="text-xs text-emerald-600 line-clamp-1">
                  + {conversation.went_well}
                </span>
              )}
              {conversation.to_improve && (
                <span className="text-xs text-amber-600 line-clamp-1">
                  - {conversation.to_improve}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {dateStr}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
