export const LOCAL_DAILY_BACKUP_CHANGED_EVENT = "plna:local-daily-backup-changed";
export const LOCAL_DAILY_BACKUP_SYNC_EVENT = "plna:local-daily-backup-synced";

export interface LocalBackupJournal {
  date: string;
  accomplishments: string;
  to_improve: string;
  went_well: string;
}

export interface LocalBackupTodo {
  id?: string;
  date: string;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at?: string;
}

export interface LocalBackupHabitCheck {
  date: string;
  habitNameEn: string;
}

export interface LocalDailyBackupPayload {
  journals: LocalBackupJournal[];
  todos: LocalBackupTodo[];
  habitChecks: LocalBackupHabitCheck[];
}

export interface LocalDailyDashboardDay {
  date: string;
  habitRate: number;
  habitCompleted: number;
  habitTotal: number;
  todoCompleted: number;
  todoTotal: number;
  todos: Array<{
    id: string;
    text: string;
    completed: boolean;
  }>;
  accomplishments: string;
  went_well: string;
  to_improve: string;
}

export interface LocalDailyDashboardData {
  week: string;
  dailyData: LocalDailyDashboardDay[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toBoolean(value: unknown) {
  return value === true;
}

function toSortOrder(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown) {
  return typeof value === "string" && DATE_PATTERN.test(value) ? value : null;
}

export function buildLocalDailyBackupPayloadFromEntries(entries: Iterable<[string, string]>): LocalDailyBackupPayload {
  const payload: LocalDailyBackupPayload = {
    journals: [],
    todos: [],
    habitChecks: [],
  };

  for (const [key, rawValue] of entries) {
    const journalMatch = key.match(/^journal_(\d{4}-\d{2}-\d{2})$/);
    if (journalMatch) {
      const parsed = parseJson(rawValue);
      if (!isPlainObject(parsed)) continue;

      const journal = {
        date: journalMatch[1],
        accomplishments: toText(parsed.accomplishments),
        to_improve: toText(parsed.to_improve),
        went_well: toText(parsed.went_well),
      };

      if (journal.accomplishments || journal.to_improve || journal.went_well) {
        payload.journals.push(journal);
      }
      continue;
    }

    const todosMatch = key.match(/^todos_(\d{4}-\d{2}-\d{2})$/);
    if (todosMatch) {
      const parsed = parseJson(rawValue);
      if (!Array.isArray(parsed)) continue;

      parsed.forEach((entry, index) => {
        if (!isPlainObject(entry)) return;
        const text = toText(entry.text).trim();
        if (!text) return;

        payload.todos.push({
          id: toText(entry.id) || undefined,
          date: todosMatch[1],
          text,
          completed: toBoolean(entry.completed),
          sort_order: toSortOrder(entry.sort_order, index),
          created_at: toText(entry.created_at) || undefined,
        });
      });
      continue;
    }

    const habitsMatch = key.match(/^habits_(\d{4}-\d{2}-\d{2})$/);
    if (habitsMatch) {
      const parsed = parseJson(rawValue);
      if (!isPlainObject(parsed)) continue;

      Object.entries(parsed).forEach(([habitNameEn, checked]) => {
        if (checked === true && habitNameEn.trim()) {
          payload.habitChecks.push({
            date: habitsMatch[1],
            habitNameEn: habitNameEn.trim(),
          });
        }
      });
    }
  }

  return normalizeLocalDailyBackupPayload(payload);
}

export function normalizeLocalDailyBackupPayload(input: unknown): LocalDailyBackupPayload {
  const source = isPlainObject(input) ? input : {};
  const journalsInput = Array.isArray(source.journals) ? source.journals : [];
  const todosInput = Array.isArray(source.todos) ? source.todos : [];
  const habitChecksInput = Array.isArray(source.habitChecks) ? source.habitChecks : [];

  const journals = journalsInput.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const date = normalizeDate(entry.date);
    if (!date) return [];

    const journal = {
      date,
      accomplishments: toText(entry.accomplishments),
      to_improve: toText(entry.to_improve),
      went_well: toText(entry.went_well),
    };

    return journal.accomplishments || journal.to_improve || journal.went_well ? [journal] : [];
  });

  const todos = todosInput.flatMap((entry, index) => {
    if (!isPlainObject(entry)) return [];
    const date = normalizeDate(entry.date);
    const text = toText(entry.text).trim();
    if (!date || !text) return [];

    return [{
      id: toText(entry.id) || undefined,
      date,
      text,
      completed: toBoolean(entry.completed),
      sort_order: toSortOrder(entry.sort_order, index),
      created_at: toText(entry.created_at) || undefined,
    }];
  });

  const habitChecks = habitChecksInput.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const date = normalizeDate(entry.date);
    const habitNameEn = toText(entry.habitNameEn).trim();
    return date && habitNameEn ? [{ date, habitNameEn }] : [];
  });

  return { journals, todos, habitChecks };
}

export function hasLocalDailyBackupPayload(payload: LocalDailyBackupPayload) {
  return payload.journals.length > 0 || payload.todos.length > 0 || payload.habitChecks.length > 0;
}

export function createLocalDailyBackupPayloadSignature(payload: LocalDailyBackupPayload) {
  return JSON.stringify({
    journals: [...payload.journals].sort((left, right) => left.date.localeCompare(right.date)),
    todos: [...payload.todos].sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.sort_order - right.sort_order ||
      left.text.localeCompare(right.text) ||
      String(left.id ?? "").localeCompare(String(right.id ?? "")),
    ),
    habitChecks: [...payload.habitChecks].sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.habitNameEn.localeCompare(right.habitNameEn),
    ),
  });
}

function dateToWeek(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const d = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weekMonday(week: string) {
  const [yearStr, weekPart] = week.split("-W");
  const year = Number(yearStr);
  const weekNo = Number(weekPart);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNo - 1) * 7);
  return monday;
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekDates(week: string) {
  const monday = weekMonday(week);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toDateString(date);
  });
}

function latestLocalBackupWeek(payload: LocalDailyBackupPayload) {
  const weeks = [
    ...payload.journals.map((journal) => dateToWeek(journal.date)),
    ...payload.todos.map((todo) => dateToWeek(todo.date)),
    ...payload.habitChecks.map((check) => dateToWeek(check.date)),
  ];

  return weeks.sort().at(-1) ?? null;
}

export function buildLocalDailyDashboardData(
  payload: LocalDailyBackupPayload,
  requestedWeek?: string | null,
): LocalDailyDashboardData | null {
  const week = requestedWeek || latestLocalBackupWeek(payload);
  if (!week) return null;

  const dates = weekDates(week);
  const hasWeekData = dates.some((date) =>
    payload.journals.some((journal) => journal.date === date) ||
    payload.todos.some((todo) => todo.date === date) ||
    payload.habitChecks.some((check) => check.date === date),
  );

  if (!hasWeekData) return null;

  const weekHabitNames = new Set(
    payload.habitChecks
      .filter((check) => dates.includes(check.date))
      .map((check) => check.habitNameEn),
  );
  const fallbackHabitTotal = weekHabitNames.size;

  return {
    week,
    dailyData: dates.map((date) => {
      const journal = payload.journals.find((entry) => entry.date === date);
      const todos = payload.todos
        .filter((todo) => todo.date === date)
        .sort((left, right) => left.sort_order - right.sort_order);
      const habitChecks = payload.habitChecks.filter((check) => check.date === date);
      const habitTotal = fallbackHabitTotal || habitChecks.length;

      return {
        date,
        habitRate: habitTotal > 0 ? Math.round((habitChecks.length / habitTotal) * 100) : 0,
        habitCompleted: habitChecks.length,
        habitTotal,
        todoCompleted: todos.filter((todo) => todo.completed).length,
        todoTotal: todos.length,
        todos: todos.map((todo, index) => ({
          id: todo.id ?? `local_todo_${date}_${index}`,
          text: todo.text,
          completed: todo.completed,
        })),
        accomplishments: journal?.accomplishments ?? "",
        went_well: journal?.went_well ?? "",
        to_improve: journal?.to_improve ?? "",
      };
    }),
  };
}
