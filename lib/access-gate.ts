/**
 * 사이트 전체에 걸리는 단순 접근 키 게이트.
 *
 * PLNA는 1인용이라 로그인이 없다. 대신 환경 변수 PLNA_ACCESS_KEY를 설정하면
 * 처음 한 번 키를 입력해야 들어올 수 있고, 그 뒤로는 쿠키로 기억한다.
 * 변수가 없으면 게이트는 완전히 꺼진다(지금까지와 동일하게 동작).
 *
 * 쿠키에는 키 자체가 아니라 키의 SHA-256 해시를 담는다. 브라우저 저장소가 새어도
 * 키 원문은 나가지 않는다. Web Crypto만 써서 Node·Edge 어느 런타임에서도 돈다.
 */

export const ACCESS_COOKIE = "plna_access";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function resolveAccessKey(): string | null {
  const key = process.env.PLNA_ACCESS_KEY?.trim();
  return key ? key : null;
}

export function isAccessGateEnabled(): boolean {
  return resolveAccessKey() !== null;
}

/**
 * 게이트를 거치지 않는 경로.
 * - 로그인 화면과 로그인 API 자체
 * - 자체 토큰으로 이미 보호되는 API(위젯·브리핑). 토큰이 없으면 그쪽에서 503으로 닫힌다.
 * - PWA 매니페스트·아이콘·정적 파일. 홈 화면 설치 때 쿠키 없이 요청된다.
 */
export function isAccessGateExemptPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/api/access") return true;
  if (pathname === "/api/widget" || pathname.startsWith("/api/widget/")) return true;
  if (pathname === "/api/briefing" || pathname.startsWith("/api/briefing/")) return true;
  if (pathname === "/manifest.json" || pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function accessCookieValue(key: string): Promise<string> {
  const data = new TextEncoder().encode(`plna-access-v1:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidAccessKey(provided: string): boolean {
  const key = resolveAccessKey();
  if (!key) return false;
  return constantTimeEqual(provided, key);
}

export async function isValidAccessCookie(value: string | undefined): Promise<boolean> {
  const key = resolveAccessKey();
  if (!key || !value) return false;
  return constantTimeEqual(value, await accessCookieValue(key));
}

/** 로그인 뒤 돌아갈 경로. 외부로 새지 않도록 같은 사이트의 절대 경로만 받는다. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
