import { pathToFileURL } from "node:url";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const DEFAULT_TABLES = [
  "affirmations",
  "daily_habits",
  "habit_logs",
  "conversations",
  "conversation_topics",
  "milestones",
  "numeric_targets",
  "numeric_logs",
  "kakao_tokens",
  "notification_settings",
  "ops_backlog_items",
  "daily_todos",
  "daily_journals",
  "monthly_goals",
  "weekly_goals",
  "weekly_reflections",
  "quarterly_goals",
  "sub_goals",
];

const DEFAULT_LIMIT = 1000;
const FIRESTORE_BATCH_SIZE = 450;

export function parseArgs(args) {
  const options = {
    dryRun: false,
    limit: DEFAULT_LIMIT,
    tables: DEFAULT_TABLES,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--only=")) {
      const tables = arg
        .slice("--only=".length)
        .split(",")
        .map((table) => table.trim())
        .filter(Boolean);

      options.tables = tables.length > 0 ? tables : DEFAULT_TABLES;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const limit = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }

      options.limit = limit;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function buildSupabaseRestUrl(supabaseUrl, table, { limit, offset }) {
  const base = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;
  const url = new URL(`rest/v1/${encodeURIComponent(table)}`, base);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return url;
}

export function resolveDocumentId(table, row, index) {
  const sourceId = row && typeof row === "object" ? row.id : undefined;
  const id = sourceId === undefined || sourceId === null || sourceId === "" ? `${table}_${index}` : String(sourceId);
  return id.replaceAll("/", "_");
}

export function sanitizeDocumentData(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeDocumentData);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, sanitizeDocumentData(entryValue)]),
    );
  }

  return value;
}

export function chunkRows(rows, size = FIRESTORE_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function parseServiceAccountJson(rawJson) {
  const normalized = rawJson.trim().startsWith("{") ? rawJson : Buffer.from(rawJson, "base64").toString("utf8");
  return JSON.parse(normalized);
}

function getFirebaseCredential() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    return cert(parseServiceAccountJson(rawJson));
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }

  return applicationDefault();
}

function getAdminDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: getFirebaseCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return getFirestore();
}

async function fetchSupabasePage(table, { limit, offset, supabaseUrl, supabaseKey }) {
  const url = buildSupabaseRestUrl(supabaseUrl, table, { limit, offset });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read ${table} from Supabase (${response.status}): ${body}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Supabase returned a non-array response for ${table}.`);
  }

  return rows;
}

async function fetchSupabaseTable(table, options) {
  const rows = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabasePage(table, { ...options, offset });
    rows.push(...page);

    if (page.length < options.limit) {
      return rows;
    }

    offset += options.limit;
  }
}

async function writeFirestoreTable(db, table, rows, { dryRun }) {
  if (dryRun) {
    return { read: rows.length, written: 0 };
  }

  let written = 0;
  let globalIndex = 0;

  for (const chunk of chunkRows(rows)) {
    const batch = db.batch();

    for (const row of chunk) {
      const docId = resolveDocumentId(table, row, globalIndex);
      const docRef = db.collection(table).doc(docId);
      batch.set(docRef, sanitizeDocumentData({ ...row, id: docId }), { merge: true });
      globalIndex += 1;
      written += 1;
    }

    await batch.commit();
  }

  return { read: rows.length, written };
}

async function migrateTable(db, table, options) {
  const rows = await fetchSupabaseTable(table, options);
  return writeFirestoreTable(db, table, rows, options);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function printHelp() {
  console.log(`Usage: npm run migrate:supabase-to-firestore -- [options]

Options:
  --dry-run                 Read from Supabase and print counts without writing Firestore.
  --only=table1,table2      Migrate only selected tables.
  --limit=1000              Supabase page size. Default: 1000.
  --help                    Show this help.

Required environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
  FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or ADC
`);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  }

  const db = options.dryRun ? null : getAdminDb();
  const results = [];

  for (const table of options.tables) {
    console.log(`${options.dryRun ? "Checking" : "Migrating"} ${table}...`);
    const result = await migrateTable(db, table, {
      ...options,
      supabaseUrl,
      supabaseKey,
    });
    results.push({ table, ...result });
    console.log(`- ${table}: read ${result.read}, wrote ${result.written}`);
  }

  const totalRead = results.reduce((sum, result) => sum + result.read, 0);
  const totalWritten = results.reduce((sum, result) => sum + result.written, 0);
  console.log(`Finished. Read ${totalRead} row(s), wrote ${totalWritten} Firestore document(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
