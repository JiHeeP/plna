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
  FirestoreBatchUpdate,
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

/**
 * 예전에는 date가 문자열/날짜형(Timestamp) 두 형식으로 섞여 있을까 봐 날짜 조회를 두 번 했다.
 * 2026-11-17 전체 백업 점검에서 날짜형 date가 0건으로 확인되어 문자열 한 번만 조회한다.
 * 앱은 date를 항상 'YYYY-MM-DD' 문자열로 쓴다.
 */
function queryFilterVariants(options: FirestoreCompatQueryOptions) {
  return [options.filters ?? []];
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
  count?: () => { get: () => Promise<{ data: () => { count: number } }> };
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
    count?: () => { get: () => Promise<{ data: () => { count: number } }> };
    doc: (id?: string) => {
      id: string;
      set: (data: Record<string, unknown>, options?: { merge: boolean }) => Promise<unknown>;
      delete: () => Promise<unknown>;
    };
  };
  batch?: () => {
    // 메서드 문법이어야 Admin SDK의 WriteBatch(오버로드 있음)를 그대로 받을 수 있다.
    update(ref: never, data: Record<string, unknown>): unknown;
    commit(): Promise<unknown>;
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
    async count(collectionName: string, options: FirestoreCompatQueryOptions) {
      let query: AdminFirestoreQuery = db.collection(collectionName);
      for (const filter of options.filters ?? []) {
        query = query.where(filter.field, firestoreOperator(filter.operator), filter.value);
      }
      if (typeof query.count === "function") {
        const snapshot = await query.count().get();
        return snapshot.data().count;
      }
      return (await query.get()).docs.length;
    },
    async updateMany(collectionName: string, items: FirestoreBatchUpdate[]) {
      if (!db.batch) {
        for (const item of items) {
          await db
            .collection(collectionName)
            .doc(item.id)
            .set(sanitizeForFirestore(item.data) as Record<string, unknown>, { merge: true });
        }
        return;
      }
      // Firestore 배치는 최대 500건. update()는 문서가 없으면 배치 전체를 실패시켜 잘못된 id로 빈 문서가 생기지 않는다.
      for (let start = 0; start < items.length; start += 500) {
        const batch = db.batch();
        for (const item of items.slice(start, start + 500)) {
          batch.update(
            db.collection(collectionName).doc(item.id) as never,
            sanitizeForFirestore(item.data) as Record<string, unknown>,
          );
        }
        await batch.commit();
      }
    },
  };
}
