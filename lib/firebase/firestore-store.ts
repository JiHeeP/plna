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

export function createWebFirestoreStore(db: Firestore): FirestoreCompatStore {
  return {
    async list(collectionName: string) {
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data(),
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
    doc: (id: string) => {
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
        ...snapshotDoc.data(),
      })) as FirestoreRecord[];
    },
    async create(collectionName: string, data: Record<string, unknown>) {
      const docRef = db.collection(collectionName).doc(String(data.id ?? ""));
      const id = String(data.id ?? docRef.id);
      const row = { ...data, id };
      await db.collection(collectionName).doc(id).set(sanitizeForFirestore(row) as Record<string, unknown>);
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
