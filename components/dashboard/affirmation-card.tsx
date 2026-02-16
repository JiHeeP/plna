"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AFFIRMATIONS } from "@/lib/constants";

export function AffirmationCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-4 px-5">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          나의 확언
        </p>
        <ul className="space-y-1.5">
          {AFFIRMATIONS.map((text, i) => (
            <li key={i} className="text-sm font-medium leading-relaxed">
              {text}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
