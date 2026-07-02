import { getFirebaseAdminApp } from "@/lib/firebase/server";
import {
  getISOWeekString,
  getWeekDatesFromStr,
  resolveLatestDailyDashboardWeek,
  resolveLatestDashboardWeek,
  toDateString,
} from "@/lib/utils";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse, NextRequest } from "next/server";

type FirestoreRow = Record<string, unknown> & { id: string };
type DashboardWarning = { source: string; message: string };

class DashboardQueryError extends Error {
  constructor(
    readonly source: string,
    readonly originalError: unknown,
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError));
  }
}

function isDateLikeField(key: string | undefined) {
  return key === "date" || key === "deadline" || key?.endsWith("_date");
}

function toFirestoreDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value);
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
  }

  return null;
}

function normalizeFromFirestore(value: unknown, key?: string): unknown {
  const date = toFirestoreDate(value);
  if (date) return isDateLikeField(key) ? date.toISOString().slice(0, 10) : date.toISOString();

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFromFirestore(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeFromFirestore(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

function rowFromDoc(doc: { id: string; data: () => Record<string, unknown> }): FirestoreRow {
  return {
    id: doc.id,
    ...(normalizeFromFirestore(doc.data()) as Record<string, unknown>),
  };
}

function uniqueRows(rows: FirestoreRow[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function dateStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function dateEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`);
}

function latestDateValue(rows: FirestoreRow[]) {
  return rows
    .map((row) => row.date)
    .filter((date): date is string => typeof date === "string")
    .sort()
    .at(-1) ?? null;
}

function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return String(a) < String(b) ? -1 : 1;
}

function compareBy(...fields: string[]) {
  return (left: FirestoreRow, right: FirestoreRow) => {
    for (const field of fields) {
      const compared = compareValues(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  };
}

async function querySource<T>(source: string, query: () => Promise<T>) {
  try {
    return await query();
  } catch (error) {
    throw new DashboardQueryError(source, error);
  }
}

function warningFromError(fallbackSource: string, error: unknown): DashboardWarning {
  if (error instanceof DashboardQueryError) {
    return {
      source: error.source,
      message: error.message,
    };
  }

  return {
    source: fallbackSource,
    message: error instanceof Error ? error.message : String(error),
  };
}

function addWarning(warnings: DashboardWarning[], warning: DashboardWarning) {
  if (!warnings.some((entry) => entry.source === warning.source && entry.message === warning.message)) {
    warnings.push(warning);
  }
}

async function optionalQuery<T>(
  warnings: DashboardWarning[],
  source: string,
  fallback: T,
  query: () => Promise<T>,
) {
  try {
    return await query();
  } catch (error) {
    const warning = warningFromError(source, error);
    console.warn("Weekly dashboard partial query error:", warning.source, warning.message);
    addWarning(warnings, warning);
    return fallback;
  }
}

async function getLatestDate(db: FirebaseFirestore.Firestore, collectionName: string) {
  return querySource(collectionName, async () => {
    const [stringSnapshot, dateSnapshot] = await Promise.all([
      db.collection(collectionName)
        .where("date", ">=", "0000-00-00")
        .orderBy("date", "desc")
        .limit(1)
        .get(),
      db.collection(collectionName)
        .where("date", ">=", new Date(0))
        .orderBy("date", "desc")
        .limit(1)
        .get(),
    ]);

    return latestDateValue(uniqueRows([
      ...stringSnapshot.docs.map(rowFromDoc),
      ...dateSnapshot.docs.map(rowFromDoc),
    ]));
  });
}

async function getLatestWeek(db: FirebaseFirestore.Firestore, collectionName: string) {
  return querySource(collectionName, async () => {
    const snapshot = await db.collection(collectionName).orderBy("week", "desc").limit(1).get();
    return snapshot.docs[0] ? rowFromDoc(snapshot.docs[0]).week : null;
  });
}

async function getRowsByDateRange(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  startDate: string,
  endDate: string,
) {
  return querySource(collectionName, async () => {
    const [stringSnapshot, dateSnapshot] = await Promise.all([
      db
        .collection(collectionName)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get(),
      db
        .collection(collectionName)
        .where("date", ">=", dateStart(startDate))
        .where("date", "<=", dateEnd(endDate))
        .get(),
    ]);

    return uniqueRows([
      ...stringSnapshot.docs.map(rowFromDoc),
      ...dateSnapshot.docs.map(rowFromDoc),
    ]);
  });
}

async function getWeeklyRows(db: FirebaseFirestore.Firestore, collectionName: string, week: string) {
  return querySource(collectionName, async () => {
    const snapshot = await db.collection(collectionName).where("week", "==", week).get();
    return snapshot.docs.map(rowFromDoc);
  });
}

async function getActiveHabits(db: FirebaseFirestore.Firestore) {
  return querySource("daily_habits", async () => {
    const snapshot = await db.collection("daily_habits").get();
    return snapshot.docs
      .map(rowFromDoc)
      .filter((habit) => habit.is_active === true)
      .sort(compareBy("sort_order", "created_at"));
  });
}

async function resolveDashboardWeek(
  db: FirebaseFirestore.Firestore,
  requestedWeek: string | null,
  warnings: DashboardWarning[],
) {
  if (requestedWeek) return requestedWeek;

  const [latestLogDate, latestJournalDate, latestTodoDate] = await Promise.all([
    optionalQuery(warnings, "habit_logs", null, () => getLatestDate(db, "habit_logs")),
    optionalQuery(warnings, "daily_journals", null, () => getLatestDate(db, "daily_journals")),
    optionalQuery(warnings, "daily_todos", null, () => getLatestDate(db, "daily_todos")),
  ]);

  const latestDailyWeek = resolveLatestDailyDashboardWeek({
    latestLogDate: typeof latestLogDate === "string" ? latestLogDate : null,
    latestJournalDate: typeof latestJournalDate === "string" ? latestJournalDate : null,
    latestTodoDate: typeof latestTodoDate === "string" ? latestTodoDate : null,
  });

  if (latestDailyWeek) return latestDailyWeek;

  const [latestGoalWeek, latestReflectionWeek] = await Promise.all([
    optionalQuery(warnings, "weekly_goals", null, () => getLatestWeek(db, "weekly_goals")),
    optionalQuery(warnings, "weekly_reflections", null, () => getLatestWeek(db, "weekly_reflections")),
  ]);

  return resolveLatestDashboardWeek({
    latestGoalWeek: typeof latestGoalWeek === "string" ? latestGoalWeek : null,
    latestReflectionWeek: typeof latestReflectionWeek === "string" ? latestReflectionWeek : null,
    fallbackDate: new Date(),
  });
}

function errorResponse(error: unknown, req: NextRequest) {
  if (error instanceof DashboardQueryError) {
    console.error("Weekly dashboard query error:", error.source, error.originalError);
    return NextResponse.json(
      {
        error: error.message,
        source: error.source,
      },
      { status: 500 },
    );
  }

  console.error("Weekly dashboard GET error:", error);
  return NextResponse.json(
    {
      error: "Weekly dashboard data load failed",
      week: req.nextUrl.searchParams.get("week") || "",
      dailyData: [],
      weeklyGoals: [],
      reflection: null,
    },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
  try {
    const db = getFirestore(getFirebaseAdminApp());
    const warnings: DashboardWarning[] = [];
    const week = await optionalQuery(
      warnings,
      "weekly-dashboard-week",
      getISOWeekString(new Date()),
      () => resolveDashboardWeek(db, req.nextUrl.searchParams.get("week"), warnings),
    );

    const dates = getWeekDatesFromStr(week);
    const startDate = toDateString(dates[0]);
    const endDate = toDateString(dates[6]);

    const [habits, logs, journals, todos, weeklyGoals, reflections] = await Promise.all([
      optionalQuery(warnings, "daily_habits", [], () => getActiveHabits(db)),
      optionalQuery(warnings, "habit_logs", [], () => getRowsByDateRange(db, "habit_logs", startDate, endDate)),
      optionalQuery(warnings, "daily_journals", [], () =>
        getRowsByDateRange(db, "daily_journals", startDate, endDate),
      ),
      optionalQuery(warnings, "daily_todos", [], () => getRowsByDateRange(db, "daily_todos", startDate, endDate)),
      optionalQuery(warnings, "weekly_goals", [], () => getWeeklyRows(db, "weekly_goals", week)),
      optionalQuery(warnings, "weekly_reflections", [], () => getWeeklyRows(db, "weekly_reflections", week)),
    ]);

    const completedLogs = logs.filter((log) => log.completed === true);
    const sortedTodos = todos.sort(compareBy("date", "sort_order", "created_at"));
    const sortedWeeklyGoals = weeklyGoals.sort(compareBy("sort_order", "created_at"));
    const reflection = reflections[0] ?? null;
    const totalHabitsPerDay = habits.length;

    const dailyData = dates.map((d) => {
      const dateStr = toDateString(d);
      const dayLogs = completedLogs.filter((log) => log.date === dateStr);
      const journal = journals.find((entry) => entry.date === dateStr);
      const dayTodos = sortedTodos.filter((todo) => todo.date === dateStr);

      return {
        date: dateStr,
        habitRate: totalHabitsPerDay > 0
          ? Math.round((dayLogs.length / totalHabitsPerDay) * 100)
          : 0,
        habitCompleted: dayLogs.length,
        habitTotal: totalHabitsPerDay,
        todoCompleted: dayTodos.filter((todo) => todo.completed === true).length,
        todoTotal: dayTodos.length,
        todos: dayTodos.map((todo) => ({
          id: String(todo.id),
          text: String(todo.text ?? ""),
          completed: todo.completed === true,
        })),
        accomplishments: String(journal?.accomplishments ?? ""),
        went_well: String(journal?.went_well ?? ""),
        to_improve: String(journal?.to_improve ?? ""),
      };
    });

    return NextResponse.json({
      week,
      dailyData,
      weeklyGoals: sortedWeeklyGoals,
      reflection,
      warnings,
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
