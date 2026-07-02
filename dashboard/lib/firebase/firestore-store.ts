import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as firestoreLimit,
  query as firestoreQuery,
  setDoc,
  where,
  type Firestore,
  type QueryConstraint,
  type WhereFilterOp,
} from "firebase/firestore";

import type {
  FilterOperator,
  FirestoreCompatQueryOptions,
  FirestoreCompatStore,
  FirestoreRecord,
} from "./supabase-compatible";

function sanitizeForFirestore(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestore);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, sanitizeForFirestore(entryValue)]),
    );
  }

  return value;
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

function firestoreOperator(operator: FilterOperator) {
  switch (operator) {
    case "eq":
      return "==";
    case "neq":
      return "!=";
    case "gte":
      return ">=";
    case "lte":
      return "<=";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "in":
      return "in";
  }
}

function dateStringToDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
}

function queryFilterVariants(options: FirestoreCompatQueryOptions) {
  const filters = options.filters ?? [];
  const dateConvertedFilters = filters.map((filter) => {
    if (filter.field !== "date") return filter;
    const date = dateStringToDate(filter.value);
    return date ? { ...filter, value: date } : filter;
  });
  const hasDateVariant = dateConvertedFilters.some((filter, index) => filter.value !== filters[index]?.value);

  return hasDateVariant ? [filters, dateConvertedFilters] : [filters];
}

function rowFromSnapshotDoc(snapshotDoc: {
  id: string;
  data: () => Record<string, unknown>;
}) {
  return {
    id: snapshotDoc.id,
    ...(normalizeFromFirestore(snapshotDoc.data()) as Record<string, unknown>),
  } as FirestoreRecord;
}

function uniqueRows(rows: FirestoreRecord[]) {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

type AdminFirestoreQuery = {
  get: () => Promise<{
    docs: Array<{
      id: string;
      data: () => Record<string, unknown>;
    }>;
  }>;
  where: (field: string, operator: string, value: unknown) => AdminFirestoreQuery;
  limit: (count: number) => AdminFirestoreQuery;
};

export function createWebFirestoreStore(db: Firestore): FirestoreCompatStore {
  return {
    async list(collectionName: string) {
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map(rowFromSnapshotDoc);
    },
    async query(collectionName: string, options: FirestoreCompatQueryOptions) {
      const rows: FirestoreRecord[] = [];

      for (const filters of queryFilterVariants(options)) {
        const constraints: QueryConstraint[] = filters.map((filter) =>
          where(filter.field, firestoreOperator(filter.operator) as WhereFilterOp, filter.value),
        );

        if (options.limit != null) {
          constraints.push(firestoreLimit(options.limit));
        }

        const snapshot = await getDocs(firestoreQuery(collection(db, collectionName), ...constraints));
        rows.push(...snapshot.docs.map(rowFromSnapshotDoc));
      }

      return uniqueRows(rows).slice(0, options.limit ?? undefined);
    },
    async create(collectionName: string, data: Record<string, unknown>) {
      const id = String(data.id ?? doc(collection(db, collectionName)).id);
      const row = { ...data, id };
      await setDoc(doc(db, collectionName, id), sanitizeForFirestore(row) as Record<string, unknown>);
      return row as FirestoreRecord;
    },
    async update(collectionName: string, id: string, data: Record<string, unknown>) {
      const row = { ...data, id };
      await setDoc(doc(db, collectionName, id), sanitizeForFirestore(row) as Record<string, unknown>, {
        merge: true,
      });
      return row as FirestoreRecord;
    },
    async delete(collectionName: string, id: string) {
      await deleteDoc(doc(db, collectionName, id));
    },
  };
}

export function createAdminFirestoreStore(db: {
  collection: (collectionName: string) => {
    get: () => Promise<{
      docs: Array<{
        id: string;
        data: () => Record<string, unknown>;
      }>;
    }>;
    where: (field: string, operator: string, value: unknown) => AdminFirestoreQuery;
    limit: (count: number) => AdminFirestoreQuery;
    doc: (id?: string) => {
      id: string;
      set: (data: Record<string, unknown>, options?: { merge: boolean }) => Promise<unknown>;
      delete: () => Promise<unknown>;
    };
  };
}): FirestoreCompatStore {
  return {
    async list(collectionName: string) {
      const snapshot = await db.collection(collectionName).get();
      return snapshot.docs.map(rowFromSnapshotDoc);
    },
    async query(collectionName: string, options: FirestoreCompatQueryOptions) {
      const rows: FirestoreRecord[] = [];

      for (const filters of queryFilterVariants(options)) {
        let query: AdminFirestoreQuery = db.collection(collectionName);

        for (const filter of filters) {
          query = query.where(filter.field, firestoreOperator(filter.operator), filter.value);
        }

        if (options.limit != null) {
          query = query.limit(options.limit);
        }

        const snapshot = await query.get();
        rows.push(...snapshot.docs.map(rowFromSnapshotDoc));
      }

      return uniqueRows(rows).slice(0, options.limit ?? undefined);
    },
    async create(collectionName: string, data: Record<string, unknown>) {
      const collectionRef = db.collection(collectionName);
      const explicitId = data.id == null ? null : String(data.id);
      const docRef = explicitId ? collectionRef.doc(explicitId) : collectionRef.doc();
      const id = explicitId || docRef.id;
      const row = { ...data, id };
      await docRef.set(sanitizeForFirestore(row) as Record<string, unknown>);
      return row as FirestoreRecord;
    },
    async update(collectionName: string, id: string, data: Record<string, unknown>) {
      const row = { ...data, id };
      await db
        .collection(collectionName)
        .doc(id)
        .set(sanitizeForFirestore(row) as Record<string, unknown>, { merge: true });
      return row as FirestoreRecord;
    },
    async delete(collectionName: string, id: string) {
      await db.collection(collectionName).doc(id).delete();
    },
  };
}
