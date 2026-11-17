#!/usr/bin/env node
/**
 * PLNA Firestore 전체 백업 / 복호화.
 *
 *   백업:   node scripts/backup-firestore.mjs --out=backups/plna-2026-11-17.json.enc
 *   복호화: node scripts/backup-firestore.mjs --decrypt=backups/plna-2026-11-17.json.enc --out=plna.json
 *
 * - 최상위 컬렉션을 전부 자동으로 찾아 모든 문서를 JSON 하나로 저장한다(새 컬렉션도 자동 포함).
 * - PLNA_BACKUP_PASSPHRASE가 있으면 AES-256-GCM으로 암호화해 저장한다.
 *   저장소가 공개라 GitHub Actions에서는 암호화가 필수(--require-encryption).
 * - 화면·로그에는 컬렉션 이름과 문서 수만 찍는다. 데이터 내용은 절대 출력하지 않는다.
 * - 읽기만 한다. Firestore에 아무것도 쓰거나 지우지 않는다.
 *
 * 필요한 환경 변수: FIREBASE_SERVICE_ACCOUNT_JSON (JSON 원문 또는 base64)
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_ID = "plna-60b1d";
const MAGIC = "PLNA-BACKUP-v1";
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Firestore 값 → JSON. Timestamp는 { __timestamp: ISO }로 남겨 복원 때 구분할 수 있게 한다. */
export function toJsonValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return { __timestamp: value.toDate().toISOString() };
    if (value instanceof Date) return { __timestamp: value.toISOString() };
    if (typeof value.latitude === "number" && typeof value.longitude === "number") {
      return { __geopoint: [value.latitude, value.longitude] };
    }
    if (typeof value.path === "string" && typeof value.firestore === "object") return { __ref: value.path };
    if (Array.isArray(value)) return value.map(toJsonValue);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]));
  }
  return value;
}

export function encryptBackup(plaintext, passphrase) {
  if (!passphrase) throw new Error("passphrase is required");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const header = Buffer.from(MAGIC, "utf8");
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(buffer, passphrase) {
  if (!passphrase) throw new Error("passphrase is required");
  const header = Buffer.from(MAGIC, "utf8");
  if (!buffer.subarray(0, header.length).equals(header)) throw new Error("PLNA 암호화 백업 파일이 아닙니다.");
  let offset = header.length;
  const salt = buffer.subarray(offset, (offset += 16));
  const iv = buffer.subarray(offset, (offset += 12));
  const tag = buffer.subarray(offset, (offset += 16));
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buffer.subarray(offset)), decipher.final()]).toString("utf8");
}

/**
 * db: firebase-admin Firestore (listCollections 지원). 최상위 컬렉션만 담는다.
 * PLNA는 하위 컬렉션을 쓰지 않는다. 예전처럼 문서마다 하위 컬렉션을 물어보면
 * 문서 수만큼 요청이 생겨 GitHub Actions 15분 제한에 걸렸다(2026-11-17).
 */
export async function dumpFirestore(db, log = () => {}) {
  const refs = await db.listCollections();
  const entries = await Promise.all(
    refs.map(async (ref) => {
      const started = Date.now();
      const snapshot = await ref.get();
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, data: toJsonValue(doc.data()) }));
      log(`${ref.id}: ${docs.length} (${Date.now() - started}ms)`);
      return [ref.id, docs];
    }),
  );
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** 백업한 내용으로 date 칸 형식을 센다(두 번 읽지 않게). */
export function summarizeDateFormats(collections) {
  const report = {};
  for (const [name, docs] of Object.entries(collections)) {
    const counts = {};
    let hasDate = false;
    for (const { data } of docs) {
      if (!data || !("date" in data)) continue;
      hasDate = true;
      const value = data.date;
      const kind =
        value && typeof value === "object" && "__timestamp" in value
          ? "timestamp"
          : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? "string"
            : "other";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    if (hasDate) report[name] = counts;
  }
  return report;
}

function describeStart(text) {
  const first = text.trim()[0];
  if (!first) return "비어 있음";
  if (first === '"' || first === "'") return "따옴표로 시작";
  if (first === "{") return "{ 로 시작하지만 JSON이 깨짐";
  return "JSON도 base64도 아님";
}

/**
 * 서비스 계정 값 읽기. JSON 원문 / 따옴표로 감싼 JSON / base64 모두 받는다.
 * 공개 저장소 로그에 남지 않도록, 실패해도 값의 내용은 절대 에러 메시지에 넣지 않는다.
 */
export function parseServiceAccount(raw) {
  const tryParse = (text) => {
    try {
      const value = JSON.parse(text);
      if (typeof value === "string") return tryParse(value);
      return value && typeof value === "object" && value.client_email ? value : null;
    } catch {
      return null;
    }
  };
  let text = String(raw).trim();
  const direct = tryParse(text);
  if (direct) return direct;
  if (/^'.*'$/s.test(text)) text = text.slice(1, -1).trim();
  const unquoted = tryParse(text);
  if (unquoted) return unquoted;
  const decoded = tryParse(Buffer.from(text, "base64").toString("utf8").trim());
  if (decoded) return decoded;
  throw new Error(
    `FIREBASE_SERVICE_ACCOUNT_JSON 값을 읽을 수 없습니다(${describeStart(String(raw))}). ` +
      "Firebase 서비스 계정 JSON 파일 내용 전체({ 부터 } 까지)를 그대로 넣어주세요.",
  );
}

function parseArgs(argv) {
  const options = { out: null, decrypt: null, requireEncryption: false };
  for (const arg of argv) {
    if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    if (arg.startsWith("--decrypt=")) options.decrypt = arg.slice("--decrypt=".length);
    if (arg === "--require-encryption") options.requireEncryption = true;
  }
  return options;
}

export async function getDb() {
  const { applicationDefault, cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential = applicationDefault();
  let projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  if (raw) {
    const json = parseServiceAccount(raw);
    credential = cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key?.replace(/\\n/g, "\n"),
    });
    projectId = json.project_id ?? projectId;
  }
  const app = getApps()[0] ?? initializeApp({ credential, projectId });
  return getFirestore(app);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const passphrase = process.env.PLNA_BACKUP_PASSPHRASE?.trim() || null;

  if (options.decrypt) {
    if (!options.out) throw new Error("--out=복호화할_파일.json 이 필요합니다.");
    writeFileSync(options.out, decryptBackup(readFileSync(options.decrypt), passphrase));
    console.log(`복호화 완료: ${options.out}`);
    return;
  }

  if (!options.out) throw new Error("--out=저장할_파일 경로가 필요합니다.");
  if (options.requireEncryption && !passphrase) {
    throw new Error("PLNA_BACKUP_PASSPHRASE가 없습니다. 공개 저장소에서는 암호화 없이 백업하지 않습니다.");
  }

  const collections = await dumpFirestore(await getDb(), (line) => console.log(line));
  const payload = JSON.stringify({ format: MAGIC, created_at: new Date().toISOString(), collections });
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, passphrase ? encryptBackup(payload, passphrase) : payload);

  const dateReport = summarizeDateFormats(collections);
  let timestamps = 0;
  for (const [name, counts] of Object.entries(dateReport)) {
    timestamps += counts.timestamp ?? 0;
    console.log(`date 형식 ${name}: ${JSON.stringify(counts)}`);
  }
  console.log(timestamps === 0 ? "날짜형(Timestamp) date 없음" : `날짜형 date ${timestamps}건 남아 있음`);
  console.log(`백업 완료${passphrase ? "(암호화)" : "(암호화 안 함)"}: ${options.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
