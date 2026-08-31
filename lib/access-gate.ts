/**
 * 앱 접근 게이트 (매직 링크 방식).
 *
 * 이 앱에는 로그인 화면이 없다. 대신 `PLNA_ACCESS_KEY` 가 들어간 주소를
 * 기기에서 한 번 열면 1년짜리 쿠키가 심기고, 그 뒤로는 그 기기만 들어온다.
 *
 *   https://plna.vercel.app/?key=<PLNA_ACCESS_KEY>
 *
 * 쿠키에는 키 자체가 아니라 키로 만든 HMAC 값을 넣는다. 쿠키를 훔쳐도
 * 원래 키는 알 수 없고, 키를 바꾸면 기존 쿠키가 한 번에 무효가 된다.
 *
 * 미들웨어(Edge 런타임)에서 쓰이므로 node:crypto 대신 Web Crypto 만 쓴다.
 */
export const ACCESS_COOKIE_NAME = "plna_access";
export const ACCESS_KEY_PARAM = "key";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년

/** 쿠키 값의 세대. 형식을 바꾸면 이 문자열을 바꿔 기존 쿠키를 무효로 만든다. */
const COOKIE_PAYLOAD = "plna-access-v1";

/**
 * 게이트를 지나치는 경로.
 * - `/api/widget` — 위젯 전용 토큰으로 스스로 인증한다 (홈 화면 위젯이 쿠키를 못 가진다).
 * - 나머지는 정적 자산이라 보호할 내용이 없다.
 */
const PUBLIC_PATHS = [
  "/api/widget",
  "/_next",
  "/icons",
  "/manifest.json",
  "/icon.svg",
  "/favicon.ico",
  "/pin-widget.ps1",
  "/plna-widget.ini",
  "/daily-backup-recovery.js",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function resolveAccessKey(): string | null {
  const key = process.env.PLNA_ACCESS_KEY?.trim();
  return key ? key : null;
}

/** 키로부터 쿠키에 넣을 값을 만든다. 같은 키면 항상 같은 값이 나온다. */
export async function accessCookieValue(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(COOKIE_PAYLOAD));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** 길이가 같은 문자열끼리는 비교 시간이 내용에 좌우되지 않게 한다. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export type AccessDecision =
  | { action: "allow" }
  | { action: "disabled" }
  | { action: "grant"; cookie: string }
  | { action: "deny" };

/**
 * 요청 하나를 어떻게 처리할지 정한다. 미들웨어가 이 결과대로만 움직이도록
 * 판단 자체는 여기 모아 두고 테스트한다.
 */
export async function decideAccess(input: {
  pathname: string;
  keyParam: string | null;
  cookie: string | null;
  configuredKey: string | null;
}): Promise<AccessDecision> {
  if (isPublicPath(input.pathname)) return { action: "allow" };
  if (!input.configuredKey) return { action: "disabled" };

  const expected = await accessCookieValue(input.configuredKey);

  // 매직 링크: 키가 맞으면 쿠키를 심어 주고, 주소에서 키를 지운다.
  if (input.keyParam && safeEqual(input.keyParam, input.configuredKey)) {
    return { action: "grant", cookie: expected };
  }

  if (input.cookie && safeEqual(input.cookie, expected)) return { action: "allow" };

  return { action: "deny" };
}
