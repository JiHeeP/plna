import { AffirmationCard } from "@/components/dashboard/affirmation-card";
import { HabitChecklist } from "@/components/dashboard/habit-checklist";
import { DailyTodoList } from "@/components/dashboard/daily-todo";
import { DailyJournalCard } from "@/components/dashboard/daily-journal";
import { StreakCounter } from "@/components/dashboard/streak-counter";
import { InsightCard } from "@/components/dashboard/insight-card";
import { YEAR_START } from "@/lib/constants";

function getDayInfo() {
  const now = new Date();
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const day = dayNames[now.getDay()];

  const diffTime = now.getTime() - YEAR_START.getTime();
  const dDay = Math.floor(diffTime / 86400000);

  return { year, month, date, day, dDay };
}

export default function Dashboard() {
  const { year, month, date, day, dDay } = getDayInfo();

  return (
    <div className="space-y-4 px-4 pt-6">
      {/* 날짜 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">
          {year}년 {month}월 {date}일 ({day})
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          2026 목표 D+{dDay}
        </p>
      </div>

      {/* 오늘의 확언 */}
      <AffirmationCard />

      {/* 오늘의 할 일 */}
      <DailyTodoList />

      {/* 습관 체크리스트 */}
      <HabitChecklist />

      {/* 오늘의 기록 */}
      <DailyJournalCard />

      {/* 주간/월간 인사이트 */}
      <InsightCard />

      {/* 스트릭 카운터 */}
      <StreakCounter />
    </div>
  );
}
