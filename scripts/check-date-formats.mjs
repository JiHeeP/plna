#!/usr/bin/env node
/**
 * date 칸 형식 점검 (읽기 전용).
 *
 *   node scripts/check-date-formats.mjs
 *
 * 앱은 date를 'YYYY-MM-DD' 문자열로 쓰지만, 옛 데이터 일부가 Firestore 날짜형(Timestamp)으로 남아 있을 수 있어
 * 날짜로 찾을 때마다 두 형식으로 두 번 조회한다. 이 스크립트는 컬렉션별로 형식별 개수만 센다.
 * 날짜형이 0건이면 이중 조회를 없애도 안전하다. 데이터 내용은 출력하지 않고, 아무것도 쓰지 않는다.
 */
import { pathToFileURL } from "node:url";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function classifyDate(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return DATE_RE.test(value) ? "string" : "other_string";
  if (typeof value === "object" && typeof value.toDate === "function") return "timestamp";
  return "other";
}

export async function auditDateFormats(db) {
  const report = {};
  for (const ref of await db.listCollections()) {
    const snapshot = await ref.get();
    const counts = {};
    let hasDate = false;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if ("date" in data) hasDate = true;
      const kind = classifyDate(data.date);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    if (hasDate) report[ref.id] = counts;
  }
  return report;
}

async function main() {
  const { getDb } = await import("./backup-firestore.mjs");
  const report = await auditDateFormats(await getDb());
  let timestamps = 0;
  for (const [name, counts] of Object.entries(report)) {
    timestamps += counts.timestamp ?? 0;
    console.log(`${name}: ${JSON.stringify(counts)}`);
  }
  console.log(timestamps === 0 ? "날짜형(Timestamp) date 없음 → 이중 조회 제거 가능" : `날짜형 date ${timestamps}건 → 문자열로 통일 필요`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
