#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const DEFAULT_PROJECT_ID = "plna-60b1d";
const PROJECT_NUMBER = "957210805979";

function parseArgs(argv) {
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    hours: 24,
  };

  for (const arg of argv) {
    if (arg.startsWith("--project=")) options.projectId = arg.slice("--project=".length);
    if (arg.startsWith("--project-number=")) options.projectNumber = arg.slice("--project-number=".length);
    if (arg.startsWith("--hours=")) {
      const hours = Number(arg.slice("--hours=".length));
      if (Number.isFinite(hours) && hours > 0) options.hours = hours;
    }
  }

  return options;
}

function firebaseAccessToken() {
  const output = execFileSync("firebase", ["login:list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  const token = parsed.result?.[0]?.tokens?.access_token;
  if (!token) {
    throw new Error("Firebase CLI login token not found. Run `firebase login` first.");
  }
  return token;
}

async function googleGet(url, token) {
  const output = execFileSync("curl", ["-sS", "-H", `Authorization: Bearer ${token}`, String(url)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const json = output ? JSON.parse(output) : {};
  if (json.error) {
    throw new Error(json.error.message ?? JSON.stringify(json.error));
  }
  return json;
}

async function quotaLimits({ projectNumber, token }) {
  const url = new URL(
    `https://serviceusage.googleapis.com/v1beta1/projects/${projectNumber}/services/firestore.googleapis.com/consumerQuotaMetrics`,
  );
  const json = await googleGet(url, token);
  const limits = {};

  for (const metric of json.metrics ?? []) {
    const limit = metric.consumerQuotaLimits?.[0]?.quotaBuckets?.[0]?.effectiveLimit;
    if (limit == null) continue;
    limits[metric.metric] = Number(limit);
  }

  return {
    readOperationsPerDay: limits["firestore.googleapis.com/read_operations_per_project"] ?? null,
    writeOperationsPerDay: limits["firestore.googleapis.com/write_operations_per_project"] ?? null,
    deleteOperationsPerDay: limits["firestore.googleapis.com/delete_operations_per_project"] ?? null,
  };
}

function pointValue(point) {
  return Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
}

function pointHour(point) {
  const endTime = point.interval?.endTime ?? point.interval?.startTime;
  if (!endTime) return null;
  const date = new Date(endTime);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

async function metricSummary({ projectId, metricType, hours, token }) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`);
  url.searchParams.set("filter", `metric.type="${metricType}"`);
  url.searchParams.set("interval.startTime", start.toISOString());
  url.searchParams.set("interval.endTime", end.toISOString());
  url.searchParams.set("aggregation.alignmentPeriod", "3600s");
  url.searchParams.set("aggregation.perSeriesAligner", "ALIGN_SUM");
  url.searchParams.set("aggregation.crossSeriesReducer", "REDUCE_SUM");

  const json = await googleGet(url, token);
  let total = 0;
  const hourly = new Map();
  for (const series of json.timeSeries ?? []) {
    for (const point of series.points ?? []) {
      const value = pointValue(point);
      total += value;
      const hour = pointHour(point);
      if (hour) hourly.set(hour, (hourly.get(hour) ?? 0) + value);
    }
  }

  return {
    total: Math.round(total),
    hourly: [...hourly]
      .map(([hour, value]) => ({ hour, value: Math.round(value) }))
      .sort((left, right) => left.hour.localeCompare(right.hour)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = firebaseAccessToken();
  const [limits, reads, writes, recentReads] = await Promise.all([
    quotaLimits({ projectNumber: options.projectNumber, token }),
    metricSummary({
      projectId: options.projectId,
      metricType: "firestore.googleapis.com/document/read_count",
      hours: options.hours,
      token,
    }),
    metricSummary({
      projectId: options.projectId,
      metricType: "firestore.googleapis.com/document/write_count",
      hours: options.hours,
      token,
    }),
    metricSummary({
      projectId: options.projectId,
      metricType: "firestore.googleapis.com/document/read_count",
      hours: 1,
      token,
    }),
  ]);

  console.log(JSON.stringify({
    projectId: options.projectId,
    windowHours: options.hours,
    limits,
    usage: {
      documentReads: reads.total,
      documentWrites: writes.total,
      documentReadsLastHour: recentReads.total,
      readHotspots: reads.hourly
        .filter((entry) => entry.value > 0)
        .sort((left, right) => right.value - left.value)
        .slice(0, 5),
    },
    readQuotaExceeded: limits.readOperationsPerDay != null
      ? reads.total >= limits.readOperationsPerDay
      : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
