"use client";

import { useState } from "react";
import { AffirmationCard } from "@/components/dashboard/affirmation-card";
import { HabitChecklist } from "@/components/dashboard/habit-checklist";
import { DailyTodoList } from "@/components/dashboard/daily-todo";
import { DailyJournalCard } from "@/components/dashboard/daily-journal";
import { StreakCounter } from "@/components/dashboard/streak-counter";
import { WeeklyGoalsDisplay } from "@/components/dashboard/weekly-goals-display";
import { YEAR_START } from "@/lib/constants";
import { getISOWeekString } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDayInfo(date: Date) {
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = dayNames[date.getDay()];

  const diffTime = date.getTime() - YEAR_START.getTime();
  const dDay = Math.floor(diffTime / 86400000);

  return { year, month, day, dayOfWeek, dDay };
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { year, month, day, dayOfWeek, dDay } = getDayInfo(selectedDate);
  const dateStr = toDateString(selectedDate);
  const currentWeek = getISOWeekString(selectedDate);

  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  return (
    <div className="space-y-4 lg:space-y-6 px-4 pt-6 lg:px-8 lg:pt-8">
      {/* 날짜 헤더 */}
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevDay}
            className="p-1 rounded-md hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl lg:text-3xl font-bold flex-1 text-center">
            {month}월 {day}일 ({dayOfWeek})
          </h1>
          <button
            type="button"
            onClick={goToNextDay}
            className="p-1 rounded-md hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <p className="text-sm lg:text-base text-muted-foreground mt-0.5 text-center">
          {year}년 · 2026 목표 D+{dDay}
        </p>
      </div>

      {/* 이번 주 목표 */}
      <WeeklyGoalsDisplay week={currentWeek} />

      {/* 오늘의 확언 */}
      <AffirmationCard />

      {/* 오늘의 할 일 */}
      <DailyTodoList date={dateStr} />

      {/* 습관 체크리스트 */}
      <HabitChecklist date={dateStr} />

      {/* 오늘의 기록 */}
      <DailyJournalCard date={dateStr} />

      {/* 스트릭 카운터 */}
      <StreakCounter />
    </div>
  );
}
