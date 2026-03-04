"use client";

import { WeeklyDashboard } from "@/components/stats/weekly-dashboard";

export default function WeeklyDashboardPage() {
  return (
    <div className="px-4 pt-6 pb-24 space-y-6 lg:px-8 lg:pt-8">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <WeeklyDashboard />
    </div>
  );
}
