import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ISO 주차 문자열 반환 ('YYYY-Www'). 주는 월요일 시작 (ISO 8601). */
export function getISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** 해당 ISO 주차의 월요일 Date 반환. */
export function getWeekMonday(weekStr: string): Date {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekPart);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

/** 해당 ISO 주차의 월~일 7일 Date 배열 반환. */
export function getWeekDatesFromStr(weekStr: string): Date[] {
  const monday = getWeekMonday(weekStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** ISO 주차를 delta만큼 이동. */
export function shiftWeek(weekStr: string, delta: number): string {
  const monday = getWeekMonday(weekStr);
  monday.setDate(monday.getDate() + delta * 7);
  return getISOWeekString(monday);
}

/** 주차를 '3/2 ~ 3/8' 형태로 표시. */
export function formatWeekLabel(weekStr: string): string {
  const dates = getWeekDatesFromStr(weekStr);
  const mon = dates[0];
  const sun = dates[6];
  return `${mon.getMonth() + 1}/${mon.getDate()} ~ ${sun.getMonth() + 1}/${sun.getDate()}`;
}

/** Date를 'YYYY-MM-DD' 형태로 변환. */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function maxString(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function dateToWeek(date: string | null | undefined) {
  return date ? getISOWeekString(new Date(`${date}T00:00:00`)) : null;
}

export function resolveLatestDailyDashboardWeek({
  latestLogDate,
  latestJournalDate,
  latestTodoDate,
}: {
  latestLogDate?: string | null;
  latestJournalDate?: string | null;
  latestTodoDate?: string | null;
}) {
  return maxString([
    dateToWeek(latestLogDate),
    dateToWeek(latestJournalDate),
    dateToWeek(latestTodoDate),
  ]);
}

export function resolveLatestDashboardWeek({
  latestLogDate,
  latestJournalDate,
  latestTodoDate,
  latestGoalWeek,
  latestReflectionWeek,
  fallbackDate = new Date(),
}: {
  latestLogDate?: string | null;
  latestJournalDate?: string | null;
  latestTodoDate?: string | null;
  latestGoalWeek?: string | null;
  latestReflectionWeek?: string | null;
  fallbackDate?: Date;
}) {
  const latestDailyWeek = resolveLatestDailyDashboardWeek({
    latestLogDate,
    latestJournalDate,
    latestTodoDate,
  });

  if (latestDailyWeek) return latestDailyWeek;

  return maxString([latestGoalWeek, latestReflectionWeek]) ?? getISOWeekString(fallbackDate);
}
