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
