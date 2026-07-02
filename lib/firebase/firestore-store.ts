import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import type { FirestoreCompatStore, FirestoreRecord } from "./supabase-compatible";

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

export function createWebFirestoreStore(db: Firestore): FirestoreCompatStore {
  return {
    async list(collectionName: string) {
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(normalizeFromFirestore(snapshotDoc.data()) as Record<string, unknown>),
      })) as FirestoreRecord[];
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
      return snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(normalizeFromFirestore(snapshotDoc.data()) as Record<string, unknown>),
      })) as FirestoreRecord[];
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
