import { randomUUID } from "node:crypto";

import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "./server";
import { TODO_CATEGORIES, isTodoCategory, normalizeTodoCategory, type TodoCategory } from "../todo-category";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface DailyJournalInput {
  date: string;
  accomplishments?: string | null;
  to_improve?: string | null;
  went_well?: string | null;
  updated_at?: string;
}

interface DailyDiaryInput {
  date: string;
  content?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface DailyTodoInput {
  id?: string | null;
  date: string;
  text: string;
  completed?: boolean;
  category?: TodoCategory | string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

interface DailyTodoPatchInput {
  id: string;
  date?: string | null;
  completed?: boolean;
  text?: string;
  category?: TodoCategory | string;
  sort_order?: number;
  updated_at?: string;
}

interface HabitLogInput {
  habit_id: string;
  date: string;
  completed: boolean;
  value?: number | null;
  created_at?: string;
  updated_at?: string;
}

type DailyWriteDb = Pick<Firestore, "collection">;

function nowIso() {
  return new Date().toISOString();
}

function assertDate(value: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error("date must use YYYY-MM-DD.");
  }
}

export function safeDailyRecordId(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("/")) return null;
  return trimmed;
}

function docIdSegment(value: string) {
  const trimmed = value.trim().replaceAll("/", "_");
  if (!trimmed) {
    throw new Error("document id segment cannot be empty.");
  }
  return trimmed;
}

export function dailyJournalDocId(date: string) {
  assertDate(date);
  return `daily_journals_${date}`;
}

export function dailyDiaryDocId(date: string) {
  assertDate(date);
  return `daily_diaries_${date}`;
}

export function habitLogDocId(habitId: string, date: string) {
  assertDate(date);
  return `habit_logs_${docIdSegment(habitId)}_${date}`;
}

function todoDocId(input: DailyTodoInput) {
  const explicitId = safeDailyRecordId(input.id);
  if (explicitId) return explicitId;
  assertDate(input.date);
  return `daily_todo_${input.date}_${randomUUID()}`;
}

function dbOrDefault(db?: DailyWriteDb) {
  return db ?? getFirestore(getFirebaseAdminApp());
}

export async function writeDailyJournal(input: DailyJournalInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = input.updated_at ?? nowIso();
  const id = dailyJournalDocId(input.date);
  const row = {
    id,
    date: input.date,
    accomplishments: input.accomplishments ?? "",
    to_improve: input.to_improve ?? "",
    went_well: input.went_well ?? "",
    updated_at: timestamp,
  };

  await dbOrDefault(db).collection("daily_journals").doc(id).set(row, { merge: true });
  return row;
}

export async function writeDailyDiary(input: DailyDiaryInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = input.updated_at ?? nowIso();
  const id = dailyDiaryDocId(input.date);
  const row = {
    id,
    date: input.date,
    content: input.content ?? "",
    created_at: input.created_at ?? timestamp,
    updated_at: timestamp,
  };

  await dbOrDefault(db).collection("daily_diaries").doc(id).set(row, { merge: true });
  return row;
}

export async function writeDailyTodo(input: DailyTodoInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = nowIso();
  const id = todoDocId(input);
  const sortOrder = Number(input.sort_order);
  const row = {
    id,
    date: input.date,
    text: input.text,
    completed: input.completed === true,
    category: normalizeTodoCategory(input.category),
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at ?? timestamp,
  };

  await dbOrDefault(db).collection("daily_todos").doc(id).set(row, { merge: true });
  return row;
}

function isAlreadyExistsError(error: unknown) {
  const code = (error as { code?: unknown }).code;
  if (code === 6 || code === "already-exists") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /ALREADY[_ ]EXISTS/i.test(message);
}

/**
 * 백업 복원용: 서버에 같은 id 문서가 없을 때만 만든다.
 * 이미 있는 문서는 절대 건드리지 않는다 — 낡은 localStorage 스냅샷이
 * 위젯에서 체크했거나 오늘로 이월된 할 일을 과거 상태로 되돌리는 것을 막는다.
 */
export async function createDailyTodoIfMissing(input: DailyTodoInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = nowIso();
  const id = todoDocId(input);
  const sortOrder = Number(input.sort_order);
  const row = {
    id,
    date: input.date,
    text: input.text,
    completed: input.completed === true,
    category: normalizeTodoCategory(input.category),
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at ?? timestamp,
  };

  try {
    await dbOrDefault(db).collection("daily_todos").doc(id).create(row);
    return { row, created: true };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return { row, created: false };
    }
    throw error;
  }
}

export async function patchDailyTodo(input: DailyTodoPatchInput, db?: DailyWriteDb) {
  const id = safeDailyRecordId(input.id);
  if (!id) {
    throw new Error("id is required.");
  }

  const patch: Record<string, unknown> = {
    id,
    updated_at: input.updated_at ?? nowIso(),
  };

  if (input.date) {
    assertDate(input.date);
    patch.date = input.date;
  }

  if (input.completed !== undefined) {
    patch.completed = input.completed === true;
  }

  if (input.text !== undefined) {
    patch.text = input.text;
  }

  if (input.category !== undefined) {
    if (!isTodoCategory(input.category)) {
      throw new Error(`category must be one of: ${TODO_CATEGORIES.join(", ")}.`);
    }
    patch.category = input.category;
  }

  if (input.sort_order !== undefined) {
    const sortOrder = Number(input.sort_order);
    if (Number.isFinite(sortOrder)) {
      patch.sort_order = sortOrder;
    }
  }

  await dbOrDefault(db).collection("daily_todos").doc(id).set(patch, { merge: true });
  return patch;
}

interface RolloverTodosInput {
  /** 이월 목적지 날짜(보통 오늘). 이 날짜보다 과거의 미완료 할 일이 이 날짜로 옮겨진다. */
  today: string;
  /** 조회 범위(일). 이보다 오래된 항목은 건드리지 않는다. Firestore 읽기 폭주 방지용. */
  windowDays?: number;
  updated_at?: string;
}

function shiftDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * 완료 처리되지 않은 과거 할 일을 today 로 옮긴다(이월).
 * 문서 id 와 created_at 은 그대로 두므로 언제 만든 할 일인지는 남는다.
 * 옮긴 문서 id 목록을 돌려준다.
 */
export async function rolloverIncompleteTodos(input: RolloverTodosInput, db?: DailyWriteDb) {
  assertDate(input.today);
  const windowStart = shiftDateString(input.today, -(input.windowDays ?? 30));
  const timestamp = input.updated_at ?? nowIso();

  // date 단일 필드 범위 조회라 복합 인덱스가 필요 없다. completed 는 메모리에서 거른다.
  const snapshot = await dbOrDefault(db)
    .collection("daily_todos")
    .where("date", ">=", windowStart)
    .where("date", "<", input.today)
    .get();

  const moved: string[] = [];
  await Promise.all(
    snapshot.docs.map(async (doc) => {
      if (doc.data().completed === true) return;
      await doc.ref.set({ date: input.today, updated_at: timestamp }, { merge: true });
      moved.push(doc.id);
    }),
  );
  return moved;
}

export async function deleteDailyTodo(idInput: string, db?: DailyWriteDb) {
  const id = safeDailyRecordId(idInput);
  if (!id) {
    throw new Error("id is required.");
  }

  await dbOrDefault(db).collection("daily_todos").doc(id).delete();
}

export async function writeHabitLog(input: HabitLogInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = input.updated_at ?? nowIso();
  const id = habitLogDocId(input.habit_id, input.date);
  const row = {
    id,
    habit_id: input.habit_id,
    date: input.date,
    completed: input.completed === true,
    value: input.value ?? null,
    created_at: input.created_at ?? timestamp,
    updated_at: timestamp,
  };

  await dbOrDefault(db).collection("habit_logs").doc(id).set(row, { merge: true });
  return row;
}

/**
 * 백업 복원용: 같은 습관·날짜의 로그가 서버에 없을 때만 만든다.
 * 이미 로그가 있으면(체크 해제 포함) 낡은 스냅샷이 그 상태를 덮어쓰지 못한다.
 */
export async function createHabitLogIfMissing(input: HabitLogInput, db?: DailyWriteDb) {
  assertDate(input.date);
  const timestamp = input.updated_at ?? nowIso();
  const id = habitLogDocId(input.habit_id, input.date);
  const row = {
    id,
    habit_id: input.habit_id,
    date: input.date,
    completed: input.completed === true,
    value: input.value ?? null,
    created_at: input.created_at ?? timestamp,
    updated_at: timestamp,
  };

  try {
    await dbOrDefault(db).collection("habit_logs").doc(id).create(row);
    return { row, created: true };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return { row, created: false };
    }
    throw error;
  }
}
