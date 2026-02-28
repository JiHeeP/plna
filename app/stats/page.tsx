import { WeeklyHabitGrid } from "@/components/stats/weekly-habit-grid";
import { InsightCard } from "@/components/goals/insight-card";

export default function StatsPage() {
  return (
    <div className="px-4 pt-6 pb-24 space-y-6">
      <h1 className="text-2xl font-bold">통계</h1>

      {/* 주간 습관 달성률 */}
      <WeeklyHabitGrid />

      {/* AI 인사이트 */}
      <InsightCard />
    </div>
  );
}
