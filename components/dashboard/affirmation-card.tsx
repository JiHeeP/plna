"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AFFIRMATIONS } from "@/lib/constants";

/**
 * 나의 확언. 평소엔 첫 문장만 보여 홈을 짧게 두고, 누르면 전체를 펼친다.
 */
export function AffirmationCard() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? AFFIRMATIONS : AFFIRMATIONS.slice(0, 1);
  const canExpand = AFFIRMATIONS.length > 1;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3 px-5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={!canExpand}
          aria-expanded={expanded}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs lg:text-sm font-medium text-muted-foreground">나의 확언</p>
            {canExpand && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                {expanded ? "접기" : `전체 ${AFFIRMATIONS.length}개`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {visible.map((text, i) => (
              <li key={i} className="text-sm lg:text-base font-medium leading-relaxed">
                {text}
              </li>
            ))}
          </ul>
        </button>
      </CardContent>
    </Card>
  );
}
