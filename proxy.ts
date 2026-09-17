import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  isAccessGateEnabled,
  isAccessGateExemptPath,
  isValidAccessCookie,
} from "@/lib/access-gate";

/**
 * PLNA_ACCESS_KEY가 설정된 배포에서만 동작하는 접근 게이트.
 * 쿠키가 없으면 화면 요청은 /login 으로 보내고, API 요청은 401로 막는다.
 */
export async function proxy(request: NextRequest) {
  if (!isAccessGateEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isAccessGateExemptPath(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (await isValidAccessCookie(cookie)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "접근 키가 필요합니다. /login 에서 입력하세요." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const next = `${pathname}${search}`;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
