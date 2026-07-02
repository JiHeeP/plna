import { getFirebaseAdminApp } from "@/lib/firebase/server";
import { getISOWeekString, getWeekDatesFromStr, toDateString } from "@/lib/utils";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse, NextRequest } from "next/server";

type FirestoreRow = Record<string, unknown> & { id: string };

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

function dateToWeek(date: unknown) {
  if (typeof date !== "string" || !date) return null;
  return getISOWeekString(new Date(`${date}T00:00:00`));
}

function maxString(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

async function querySource<T>(source: string, query: () => Promise<T>) {
  try {
    return await query();
  } catch (error) {
    throw new DashboardQueryError(source, error);
  }
}

async function getLatestDate(db: FirebaseFirestore.Firestore, collectionName: string) {
  return querySource(collectionName, async () => {
    const snapshot = await db.collection(collectionName).orderBy("date", "desc").limit(1).get();
    return snapshot.docs[0] ? rowFromDoc(snapshot.docs[0]).date : null;
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
    const snapshot = await db
      .collection(collectionName)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get();
    return snapshot.docs.map(rowFromDoc);
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

async function resolveDashboardWeek(db: FirebaseFirestore.Firestore, requestedWeek: string | null) {
  if (requestedWeek) return requestedWeek;

  const [latestLogDate, latestJournalDate, latestTodoDate, latestGoalWeek, latestReflectionWeek] =
    await Promise.all([
      getLatestDate(db, "habit_logs"),
      getLatestDate(db, "daily_journals"),
      getLatestDate(db, "daily_todos"),
      getLatestWeek(db, "weekly_goals"),
      getLatestWeek(db, "weekly_reflections"),
    ]);

  return maxString([
    dateToWeek(latestLogDate),
    dateToWeek(latestJournalDate),
    dateToWeek(latestTodoDate),
    typeof latestGoalWeek === "string" ? latestGoalWeek : null,
    typeof latestReflectionWeek === "string" ? latestReflectionWeek : null,
  ]) ?? getISOWeekString(new Date());
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
    const week = await resolveDashboardWeek(db, req.nextUrl.searchParams.get("week"));

    const dates = getWeekDatesFromStr(week);
    const startDate = toDateString(dates[0]);
    const endDate = toDateString(dates[6]);

    const [habits, logs, journals, todos, weeklyGoals, reflections] = await Promise.all([
      getActiveHabits(db),
      getRowsByDateRange(db, "habit_logs", startDate, endDate),
      getRowsByDateRange(db, "daily_journals", startDate, endDate),
      getRowsByDateRange(db, "daily_todos", startDate, endDate),
      getWeeklyRows(db, "weekly_goals", week),
      getWeeklyRows(db, "weekly_reflections", week),
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
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
