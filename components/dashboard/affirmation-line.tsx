"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AFFIRMATIONS } from "@/lib/constants";

/**
 * 날짜 아래 한 줄 확언. 첫 문장만 보이고, 누르면 전체 확언이 아래로 펼쳐진다.
 * 홈에서 카드 한 장을 차지하던 확언을 머리말로 옮겨 화면을 줄인다.
 */
export function AffirmationLine() {
  const [expanded, setExpanded] = useState(false);
  const canExpand = AFFIRMATIONS.length > 1;

  return (
    <div className="mt-1 text-center">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={!canExpand}
        aria-expanded={expanded}
        title={canExpand ? (expanded ? "확언 접기" : "확언 전체 보기") : undefined}
        className="inline-flex items-center gap-1 text-sm lg:text-base text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>“{AFFIRMATIONS[0]}”</span>
        {canExpand && (
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && (
        <ul className="mx-auto mt-3 max-w-2xl space-y-1.5 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-left">
          {AFFIRMATIONS.slice(1).map((text, i) => (
            <li key={i} className="text-sm lg:text-base font-medium leading-relaxed">
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
