// Mirrors Supabase's untyped row payloads so existing app code can keep its table-specific casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FirestoreRecord = any;

export interface FirestoreCompatStore {
  list(collectionName: string): Promise<FirestoreRecord[]>;
  query?(collectionName: string, options: FirestoreCompatQueryOptions): Promise<FirestoreRecord[]>;
  create(collectionName: string, data: Record<string, unknown>): Promise<FirestoreRecord>;
  update(collectionName: string, id: string, data: Record<string, unknown>): Promise<FirestoreRecord>;
  delete(collectionName: string, id: string): Promise<void>;
}

export type FilterOperator = "eq" | "neq" | "gte" | "lte" | "lt" | "gt" | "in";

export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface FirestoreCompatQueryOptions {
  filters?: QueryFilter[];
  limit?: number | null;
}

interface QueryOrder {
  field: string;
  ascending: boolean;
}

interface SelectOptions {
  count?: "exact" | null;
  head?: boolean;
}

interface UpsertOptions {
  onConflict?: string;
}

export interface SupabaseCompatError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface SupabaseCompatResult<T = FirestoreRecord[]> {
  data: T | null;
  error: SupabaseCompatError | null;
  count?: number | null;
}

type QueryAction = "select" | "insert" | "upsert" | "update" | "delete";
type Cardinality = "many" | "single" | "maybeSingle";

const UNIQUE_FIELDS: Record<string, string[]> = {
  daily_journals: ["date"],
  weekly_reflections: ["week"],
  habit_logs: ["habit_id", "date"],
  ops_backlog_items: ["date", "text"],
};

function nowIso() {
  return new Date().toISOString();
}

function todayString() {
  return nowIso().slice(0, 10);
}

function tableDefaults(collectionName: string): Record<string, unknown> {
  const timestamps = { created_at: nowIso() };

  switch (collectionName) {
    case "affirmations":
      return { ...timestamps, pillar: "general", is_active: true };
    case "daily_habits":
      return { ...timestamps, sort_order: 0, is_active: true };
    case "habit_logs":
      return { ...timestamps, completed: false, value: null };
    case "conversations":
      return {
        ...timestamps,
        date: todayString(),
        partner: "",
        context: "",
        summary: "",
        went_well: "",
        to_improve: "",
        is_imported: false,
        source_text: null,
      };
    case "conversation_topics":
      return {
        ...timestamps,
        content: null,
        category: null,
        used_count: 0,
        source_conversation_id: null,
      };
    case "milestones":
      return {
        ...timestamps,
        updated_at: nowIso(),
        status: "not_started",
        target_date: null,
        notes: null,
      };
    case "numeric_targets":
      return { ...timestamps, unit: "count" };
    case "numeric_logs":
      return { ...timestamps, date: todayString(), notes: null };
    case "daily_todos":
      return {
        ...timestamps,
        date: todayString(),
        completed: false,
        sort_order: 0,
      };
    case "daily_journals":
      return {
        ...timestamps,
        updated_at: nowIso(),
        date: todayString(),
        accomplishments: "",
        to_improve: "",
        went_well: "",
      };
    case "monthly_goals":
    case "weekly_goals":
    case "quarterly_goals":
      return {
        ...timestamps,
        updated_at: nowIso(),
        completed: false,
        sort_order: 0,
      };
    case "weekly_reflections":
      return {
        ...timestamps,
        updated_at: nowIso(),
        went_well: "",
        to_improve: "",
      };
    case "sub_goals":
      return {
        ...timestamps,
        updated_at: nowIso(),
        positioning: null,
        annual_target: null,
        quarterly_target: null,
        monthly_target: null,
        achievement_rate: 0,
        retrospective: null,
        deadline: null,
        daily_practice: null,
        weekly_practice: null,
        monthly_practice: null,
        practice_time: null,
        sort_order: 0,
        is_active: true,
      };
    case "ops_backlog_items":
      return {
        ...timestamps,
        date: todayString(),
        source: "night-log",
        status: "pending",
        sort_order: 0,
      };
    default:
      return timestamps;
  }
}

function withDefaults(collectionName: string, data: Record<string, unknown>) {
  return {
    ...tableDefaults(collectionName),
    ...data,
  };
}

function normalizeRows(rows: Record<string, unknown> | Record<string, unknown>[]) {
  return Array.isArray(rows) ? rows : [rows];
}

function selectedFields(fields: string | undefined) {
  if (!fields || fields.trim() === "*" || fields.trim() === "") return null;
  return fields
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function projectRow(row: FirestoreRecord, fields: string | undefined): FirestoreRecord {
  const selected = selectedFields(fields);
  if (!selected) return { ...row };

  return selected.reduce<FirestoreRecord>(
    (projected, field) => {
      projected[field] = row[field];
      return projected;
    },
    { id: row.id },
  );
}

function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return String(a) < String(b) ? -1 : 1;
}

function matchesFilter(row: FirestoreRecord, filter: QueryFilter) {
  const value = row[filter.field];
  switch (filter.operator) {
    case "eq":
      return value === filter.value;
    case "neq":
      return value !== filter.value;
    case "gte":
      return compareValues(value, filter.value) >= 0;
    case "lte":
      return compareValues(value, filter.value) <= 0;
    case "lt":
      return compareValues(value, filter.value) < 0;
    case "gt":
      return compareValues(value, filter.value) > 0;
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(value);
  }
}

function backendFiltersFor(filters: QueryFilter[]) {
  if (filters.length === 0) return [];

  const idFilter = filters.find((filter) => filter.field === "id" && filter.operator === "eq");
  if (idFilter) return [idFilter];

  const dateFilters = filters.filter((filter) =>
    filter.field === "date" &&
    (filter.operator === "eq" || filter.operator === "gte" || filter.operator === "lte"),
  );
  if (dateFilters.length > 0) return dateFilters;

  const weekFilter = filters.find((filter) => filter.field === "week" && filter.operator === "eq");
  if (weekFilter) return [weekFilter];

  const activeFilter = filters.find((filter) => filter.field === "is_active" && filter.operator === "eq");
  if (activeFilter) return [activeFilter];

  const firstField = filters[0].field;
  if (filters.every((filter) => filter.field === firstField)) return filters;

  const equalityFilter = filters.find((filter) => filter.operator === "eq");
  return equalityFilter ? [equalityFilter] : [filters[0]];
}

function parseOrExpression(expression: string) {
  return expression
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, operator, ...rest] = part.split(".");
      return {
        field,
        operator,
        value: rest.join("."),
      };
    });
}

function matchesOr(row: FirestoreRecord, expression: string) {
  const clauses = parseOrExpression(expression);
  if (clauses.length === 0) return true;

  return clauses.some((clause) => {
    if (clause.operator !== "ilike") return false;
    const needle = clause.value.replace(/^%|%$/g, "").toLowerCase();
    return String(row[clause.field] ?? "").toLowerCase().includes(needle);
  });
}

function singleMissingError(): SupabaseCompatError {
  return {
    code: "PGRST116",
    message: "JSON object requested, multiple (or no) rows returned",
  };
}

function toError(error: unknown): SupabaseCompatError {
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

class SupabaseCompatQuery<TData = FirestoreRecord[]>
  implements PromiseLike<SupabaseCompatResult<TData>>
{
  private action: QueryAction = "select";
  private selectFields = "*";
  private selectOptions: SelectOptions = {};
  private filters: QueryFilter[] = [];
  private orExpression: string | null = null;
  private orders: QueryOrder[] = [];
  private rowLimit: number | null = null;
  private cardinality: Cardinality = "many";
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private upsertOptions: UpsertOptions = {};
  private shouldReturnRows = false;

  constructor(
    private readonly store: FirestoreCompatStore,
    private readonly collectionName: string,
  ) {}

  select(fields = "*", options: SelectOptions = {}) {
    this.action = this.action === "select" ? "select" : this.action;
    this.selectFields = fields;
    this.selectOptions = options;
    this.shouldReturnRows = true;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options: UpsertOptions = {}) {
    this.action = "upsert";
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    return this.addFilter(field, "eq", value);
  }

  neq(field: string, value: unknown) {
    return this.addFilter(field, "neq", value);
  }

  gte(field: string, value: unknown) {
    return this.addFilter(field, "gte", value);
  }

  lte(field: string, value: unknown) {
    return this.addFilter(field, "lte", value);
  }

  lt(field: string, value: unknown) {
    return this.addFilter(field, "lt", value);
  }

  gt(field: string, value: unknown) {
    return this.addFilter(field, "gt", value);
  }

  in(field: string, values: unknown[]) {
    return this.addFilter(field, "in", values);
  }

  or(expression: string) {
    this.orExpression = expression;
    return this;
  }

  order(field: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ field, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  single() {
    this.cardinality = "single";
    return this as unknown as SupabaseCompatQuery<FirestoreRecord>;
  }

  maybeSingle() {
    this.cardinality = "maybeSingle";
    return this as unknown as SupabaseCompatQuery<FirestoreRecord>;
  }

  then<TResult1 = SupabaseCompatResult<TData>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseCompatResult<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addFilter(field: string, operator: FilterOperator, value: unknown) {
    this.filters.push({ field, operator, value });
    return this;
  }

  private async execute(): Promise<SupabaseCompatResult<TData>> {
    try {
      const rows = await this.executeAction();
      return this.formatRows(rows) as SupabaseCompatResult<TData>;
    } catch (error) {
      return { data: null, error: toError(error), count: null };
    }
  }

  private async executeAction(): Promise<FirestoreRecord[]> {
    switch (this.action) {
      case "select":
        return this.applyQuery(await this.getCandidateRows());
      case "insert":
        return this.insertRows();
      case "upsert":
        return this.upsertRows();
      case "update":
        return this.updateRows();
      case "delete":
        return this.deleteRows();
    }
  }

  private async insertRows() {
    const rows = normalizeRows(this.payload ?? {});
    const inserted: FirestoreRecord[] = [];
    for (const row of rows) {
      inserted.push(await this.store.create(this.collectionName, withDefaults(this.collectionName, row)));
    }
    return inserted;
  }

  private async upsertRows() {
    const rows = normalizeRows(this.payload ?? {});
    const conflictFields =
      this.upsertOptions.onConflict?.split(",").map((field) => field.trim()).filter(Boolean) ??
      UNIQUE_FIELDS[this.collectionName] ??
      ["id"];
    const results: FirestoreRecord[] = [];

    for (const row of rows) {
      const conflictFilters = conflictFields
        .filter((field) => row[field] !== undefined)
        .map((field) => ({ field, operator: "eq" as const, value: row[field] }));
      const existingRows = conflictFilters.length > 0
        ? await this.getCandidateRows(conflictFilters)
        : await this.store.list(this.collectionName);
      const match = existingRows.find((existing) =>
        conflictFields.every((field) => existing[field] === row[field]),
      );

      if (match) {
        const updated = { ...match, ...row };
        results.push(await this.store.update(this.collectionName, match.id, updated));
      } else {
        results.push(await this.store.create(this.collectionName, withDefaults(this.collectionName, row)));
      }
    }

    return results;
  }

  private async updateRows() {
    const patch = normalizeRows(this.payload ?? {})[0] ?? {};
    const matches = this.applyQuery(await this.getCandidateRows());
    const updatedRows: FirestoreRecord[] = [];

    for (const row of matches) {
      updatedRows.push(await this.store.update(this.collectionName, row.id, { ...row, ...patch }));
    }

    return updatedRows;
  }

  private async deleteRows() {
    const matches = this.applyQuery(await this.getCandidateRows());
    for (const row of matches) {
      await this.store.delete(this.collectionName, row.id);
    }
    return [];
  }

  private async getCandidateRows(filters = this.filters) {
    if (!this.store.query || filters.length === 0) {
      return this.store.list(this.collectionName);
    }

    return this.store.query(this.collectionName, {
      filters: backendFiltersFor(filters),
    });
  }

  private applyQuery(inputRows: FirestoreRecord[]) {
    let rows = inputRows.filter((row) => this.filters.every((filter) => matchesFilter(row, filter)));

    if (this.orExpression) {
      rows = rows.filter((row) => matchesOr(row, this.orExpression ?? ""));
    }

    if (this.orders.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const order of this.orders) {
          const compared = compareValues(left[order.field], right[order.field]);
          if (compared !== 0) return order.ascending ? compared : -compared;
        }
        return 0;
      });
    }

    if (this.rowLimit != null) {
      rows = rows.slice(0, this.rowLimit);
    }

    return rows;
  }

  private formatRows(rows: FirestoreRecord[]): SupabaseCompatResult {
    const count = this.selectOptions.count === "exact" ? rows.length : null;

    if (this.selectOptions.head) {
      return { data: null, error: null, count };
    }

    const projected = rows.map((row) => projectRow(row, this.selectFields));

    if (this.cardinality === "single") {
      if (projected.length !== 1) {
        return { data: null, error: singleMissingError(), count };
      }
      return { data: projected[0], error: null, count };
    }

    if (this.cardinality === "maybeSingle") {
      if (projected.length > 1) {
        return { data: null, error: singleMissingError(), count };
      }
      return { data: projected[0] ?? null, error: null, count };
    }

    return {
      data: this.shouldReturnRows || this.action === "select" ? projected : null,
      error: null,
      count,
    };
  }
}

export function createSupabaseCompatClient(store: FirestoreCompatStore) {
  return {
    from(collectionName: string) {
      return new SupabaseCompatQuery(store, collectionName);
    },
    async rpc(functionName: string, params: Record<string, unknown>) {
      if (functionName === "promote_backlog_item_to_todo") {
        return promoteBacklogItemToTodo(store, params);
      }

      return {
        data: null,
        error: { message: `Unsupported RPC: ${functionName}` },
      };
    },
  };
}

async function promoteBacklogItemToTodo(
  store: FirestoreCompatStore,
  params: Record<string, unknown>,
): Promise<SupabaseCompatResult<FirestoreRecord[]>> {
  const backlogId = String(params.p_backlog_id ?? "");
  const targetDate = String(params.p_target_date ?? todayString());
  const backlogCandidates = store.query
    ? await store.query("ops_backlog_items", {
        filters: [{ field: "id", operator: "eq", value: backlogId }],
      })
    : await store.list("ops_backlog_items");
  const backlog = backlogCandidates.find((item) => item.id === backlogId);

  if (!backlog) {
    return {
      data: null,
      error: { message: `Backlog item not found: ${backlogId}` },
      count: null,
    };
  }

  const todoCandidates = store.query
    ? await store.query("daily_todos", {
        filters: [{ field: "date", operator: "eq", value: targetDate }],
      })
    : await store.list("daily_todos");
  const todosForDate = todoCandidates.filter((todo) => todo.date === targetDate);
  const nextSortOrder =
    todosForDate.reduce((max, todo) => Math.max(max, Number(todo.sort_order ?? -1)), -1) + 1;
  const todo = await store.create(
    "daily_todos",
    withDefaults("daily_todos", {
      date: targetDate,
      text: backlog.text,
      completed: false,
      sort_order: nextSortOrder,
    }),
  );

  await store.update("ops_backlog_items", backlog.id, {
    ...backlog,
    status: "promoted",
  });

  return {
    data: [
      {
        id: todo.id,
        backlog_id: backlog.id,
        todo_id: todo.id,
        todo_text: todo.text,
        target_date: targetDate,
        sort_order: todo.sort_order,
      },
    ],
    error: null,
    count: 1,
  };
}

export function createMemoryFirestoreStore(
  initialData: Record<string, Record<string, unknown>[]> = {},
): FirestoreCompatStore & { list(collectionName: string): Promise<FirestoreRecord[]> } {
  const collections = new Map<string, FirestoreRecord[]>();
  const counters = new Map<string, number>();

  for (const [collectionName, rows] of Object.entries(initialData)) {
    collections.set(
      collectionName,
      rows.map((row, index) => ({
        ...row,
        id: String(row.id ?? `${collectionName}_${index + 1}`),
      })),
    );
    counters.set(collectionName, rows.length);
  }

  function collection(collectionName: string) {
    if (!collections.has(collectionName)) collections.set(collectionName, []);
    return collections.get(collectionName)!;
  }

  function nextId(collectionName: string) {
    const next = (counters.get(collectionName) ?? 0) + 1;
    counters.set(collectionName, next);
    return `${collectionName}_${next}`;
  }

  return {
    async list(collectionName: string) {
      return collection(collectionName).map((row) => ({ ...row }));
    },
    async query(collectionName: string, options: FirestoreCompatQueryOptions) {
      const filters = options.filters ?? [];
      let rows = collection(collectionName).filter((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );

      if (options.limit != null) {
        rows = rows.slice(0, options.limit);
      }

      return rows.map((row) => ({ ...row }));
    },
    async create(collectionName: string, data: Record<string, unknown>) {
      const row = {
        ...data,
        id: String(data.id ?? nextId(collectionName)),
      };
      collection(collectionName).push(row as FirestoreRecord);
      return { ...(row as FirestoreRecord) };
    },
    async update(collectionName: string, id: string, data: Record<string, unknown>) {
      const rows = collection(collectionName);
      const index = rows.findIndex((row) => row.id === id);
      const row = {
        ...data,
        id,
      } as FirestoreRecord;
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return { ...row };
    },
    async delete(collectionName: string, id: string) {
      const rows = collection(collectionName);
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}
