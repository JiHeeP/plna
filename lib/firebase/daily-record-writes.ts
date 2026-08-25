import { randomUUID } from "node:crypto";

import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "./server";
import { isTodoCategory, normalizeTodoCategory, type TodoCategory } from "../todo-category";

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
      throw new Error("category must be 'school' or 'personal'.");
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
