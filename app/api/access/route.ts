import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  accessCookieValue,
  isValidAccessKey,
  resolveAccessKey,
} from "@/lib/access-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 접근 키를 확인하고 쿠키를 심는다. 게이트가 꺼져 있으면 그냥 통과. */
export async function POST(request: NextRequest) {
  const key = resolveAccessKey();
  if (!key) return NextResponse.json({ ok: true, gate: false });

  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const provided = typeof body?.key === "string" ? body.key.trim() : "";
  if (!provided || !isValidAccessKey(provided)) {
    return NextResponse.json({ ok: false, error: "접근 키가 맞지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, gate: true });
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: await accessCookieValue(key),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}

/** 쿠키를 지운다(로그아웃). */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ACCESS_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
