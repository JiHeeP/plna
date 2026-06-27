import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { createAdminFirestoreStore } from "./firestore-store";
import { createSupabaseCompatClient } from "./supabase-compatible";

function parseServiceAccountJson() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) return null;

  const json = rawJson.trim().startsWith("{")
    ? rawJson
    : Buffer.from(rawJson, "base64").toString("utf8");

  return JSON.parse(json) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
}

function getCredential() {
  const serviceAccountJson = parseServiceAccountJson();
  if (serviceAccountJson) {
    return cert({
      projectId: serviceAccountJson.project_id,
      clientEmail: serviceAccountJson.client_email,
      privateKey: serviceAccountJson.private_key?.replace(/\\n/g, "\n"),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApp();

  return initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function hasFirebaseServerConfig() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY) ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
}

export async function createClient() {
  const db = getFirestore(getFirebaseAdminApp());
  return createSupabaseCompatClient(createAdminFirestoreStore(db));
}
