"use client";

import { WeeklyDashboard } from "@/components/weekly-dashboard";

export default function DashboardPage() {
  return (
    <div className="px-4 pt-6 pb-12 space-y-6">
      <h1 className="text-2xl font-bold">주간 대시보드</h1>
      <WeeklyDashboard />
    </div>
  );
}
