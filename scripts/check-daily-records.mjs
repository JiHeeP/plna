#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import nextEnv from "@next/env";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DAILY_COLLECTIONS = ["daily_journals", "daily_todos", "habit_logs"];
const DEFAULT_PROJECT_ID = "plna-60b1d";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const { loadEnvConfig } = nextEnv;

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getISOWeekString(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getWeekMonday(weekStr) {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = Number.parseInt(yearStr, 10);
  const week = Number.parseInt(weekPart, 10);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    throw new Error(`Invalid week: ${weekStr}`);
  }

  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

function getWeekRange(weekStr) {
  const monday = getWeekMonday(weekStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateString(monday),
    end: toDateString(sunday),
  };
}

function previousAndCurrentWeekRange(now = new Date()) {
  const currentWeek = getISOWeekString(now);
  const currentMonday = getWeekMonday(currentWeek);
  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(currentMonday.getDate() - 7);
  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentMonday.getDate() + 6);

  return {
    start: toDateString(previousMonday),
    end: toDateString(currentSunday),
  };
}

function validateDate(value, optionName) {
  if (!DATE_RE.test(value)) {
    throw new Error(`${optionName} must use YYYY-MM-DD.`);
  }
  return value;
}

export function parseArgs(args, now = new Date()) {
  const options = {
    ...previousAndCurrentWeekRange(now),
    projectId: DEFAULT_PROJECT_ID,
    includeAudit: false,
  };

  for (const arg of args) {
    if (arg === "--include-audit") {
      options.includeAudit = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--project=")) {
      options.projectId = arg.slice("--project=".length);
      continue;
    }

    if (arg.startsWith("--week=")) {
      const week = arg.slice("--week=".length);
      if (!/^\d{4}-W\d{2}$/.test(week)) {
        throw new Error("--week must use YYYY-Www, for example 2026-W27.");
      }
      Object.assign(options, getWeekRange(week));
      continue;
    }

    if (arg.startsWith("--start=")) {
      options.start = validateDate(arg.slice("--start=".length), "--start");
      continue;
    }

    if (arg.startsWith("--end=")) {
      options.end = validateDate(arg.slice("--end=".length), "--end");
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.start > options.end) {
    throw new Error("--start must be before or equal to --end.");
  }

  return options;
}

function dateStart(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

function dateEnd(date) {
  return new Date(`${date}T23:59:59.999Z`);
}

function datesBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    dates.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
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

function getAdminDb(projectId) {
  if (getApps().length === 0) {
    initializeApp({
      credential: getFirebaseCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? projectId,
    });
  }

  return getFirestore();
}

function isDateLikeField(key) {
  return key === "date" || key === "deadline" || key?.endsWith("_date");
}

function toFirestoreDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  return null;
}

function normalizeFromFirestore(value, key) {
  const date = toFirestoreDate(value);
  if (date) return isDateLikeField(key) ? date.toISOString().slice(0, 10) : date.toISOString();

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFromFirestore(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeFromFirestore(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

function rowFromDoc(doc) {
  return {
    id: doc.id,
    ...normalizeFromFirestore(doc.data()),
  };
}

function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

async function getRowsByDateRange(db, collectionName, start, end) {
  const [stringSnapshot, dateSnapshot] = await Promise.all([
    db
      .collection(collectionName)
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get(),
    db
      .collection(collectionName)
      .where("date", ">=", dateStart(start))
      .where("date", "<=", dateEnd(end))
      .get(),
  ]);

  return uniqueRows([
    ...stringSnapshot.docs.map(rowFromDoc),
    ...dateSnapshot.docs.map(rowFromDoc),
  ]);
}

function summarizeRows(collectionName, rows, dates) {
  const byDate = Object.fromEntries(dates.map((date) => [
    date,
    {
      total: 0,
      completed: 0,
    },
  ]));
  const fieldNames = new Set();

  for (const row of rows) {
    Object.keys(row).forEach((field) => fieldNames.add(field));
    if (typeof row.date !== "string" || !byDate[row.date]) continue;

    byDate[row.date].total += 1;
    if (row.completed === true) {
      byDate[row.date].completed += 1;
    }
  }

  return {
    collection: collectionName,
    total: rows.length,
    byDate,
    fieldNames: [...fieldNames].sort(),
  };
}

async function summarizeCollection(db, collectionName, dates, start, end) {
  const rows = await getRowsByDateRange(db, collectionName, start, end);
  return summarizeRows(collectionName, rows, dates);
}

async function summarizeAudit(db, dates, start, end) {
  const rows = await getRowsByDateRange(db, "daily_write_audit", start, end);
  return {
    collection: "daily_write_audit",
    total: rows.length,
    byDate: Object.fromEntries(dates.map((date) => [
      date,
      {
        total: rows.filter((row) => row.date === date).length,
        success: rows.filter((row) => row.date === date && row.status === "success").length,
        error: rows.filter((row) => row.date === date && row.status === "error").length,
      },
    ])),
  };
}

export async function inspectDailyRecords(db, options) {
  const dates = datesBetween(options.start, options.end);
  const collections = {};
  const warnings = [];

  for (const collectionName of DAILY_COLLECTIONS) {
    try {
      collections[collectionName] = await summarizeCollection(db, collectionName, dates, options.start, options.end);
    } catch (error) {
      warnings.push({
        source: collectionName,
        message: error instanceof Error ? error.message : String(error),
      });
      collections[collectionName] = summarizeRows(collectionName, [], dates);
    }
  }

  if (options.includeAudit) {
    try {
      collections.daily_write_audit = await summarizeAudit(db, dates, options.start, options.end);
    } catch (error) {
      warnings.push({
        source: "daily_write_audit",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    projectId: options.projectId,
    start: options.start,
    end: options.end,
    ok: warnings.length === 0,
    warnings,
    collections,
  };
}

function printHelp() {
  console.log(`Usage: npm run check:daily-records -- [options]

Options:
  --start=YYYY-MM-DD        Start date. Defaults to previous ISO week Monday.
  --end=YYYY-MM-DD          End date. Defaults to current ISO week Sunday.
  --week=YYYY-Www           Inspect one ISO week, for example 2026-W27.
  --include-audit           Also inspect daily_write_audit metadata.
  --project=project-id      Firebase project id. Default: ${DEFAULT_PROJECT_ID}.
  --help                    Show this help.

Output:
  JSON summary of daily_journals, daily_todos, and habit_logs counts by date.
  Journal/todo text content is not printed.
`);
}

export async function main(args = process.argv.slice(2)) {
  loadEnvConfig(process.cwd());
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  const db = getAdminDb(options.projectId);
  const report = await inspectDailyRecords(db, options);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
