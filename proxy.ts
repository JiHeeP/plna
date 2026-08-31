import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  ACCESS_KEY_PARAM,
  decideAccess,
  resolveAccessKey,
} from "@/lib/access-gate";

/**
 * 앱 전체를 매직 링크 게이트 뒤에 둔다.
 * 자세한 동작은 `lib/access-gate.ts` 주석 참고.
 *
 * Next 16 부터 `middleware.ts` 대신 `proxy.ts` 규약을 쓴다.
 */
export async function proxy(request: NextRequest) {
  const url = new URL(request.url);
  const decision = await decideAccess({
    pathname: url.pathname,
    keyParam: url.searchParams.get(ACCESS_KEY_PARAM),
    cookie: request.cookies.get(ACCESS_COOKIE_NAME)?.value ?? null,
    configuredKey: resolveAccessKey(),
  });

  switch (decision.action) {
    case "allow":
      return NextResponse.next();

    case "grant": {
      // 키가 주소에 남아 있으면 기록·공유로 새어 나가므로 지우고 다시 보낸다.
      url.searchParams.delete(ACCESS_KEY_PARAM);
      const response = NextResponse.redirect(url);
      response.cookies.set(ACCESS_COOKIE_NAME, decision.cookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        path: "/",
        maxAge: ACCESS_COOKIE_MAX_AGE,
      });
      return response;
    }

    case "disabled":
      return configurationError(url.pathname);

    case "deny":
      return denied(url.pathname);
  }
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

/**
 * 키를 안 정해 두면 앱이 통째로 열려 버리므로, 열어 두는 대신 막고 이유를 알린다.
 */
function configurationError(pathname: string) {
  const message =
    "PLNA_ACCESS_KEY 가 설정되지 않았습니다. Vercel 환경 변수에 넣고 재배포하세요.";
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: message }, { status: 503 });
  }
  return new NextResponse(page("설정 필요", message), {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function denied(pathname: string) {
  const message = "이 기기에는 접근 권한이 없습니다.";
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  return new NextResponse(
    page(message, "허용된 기기에서 접속 링크(주소 끝에 ?key=… 가 붙은 것)를 한 번 열면 이 기기가 등록됩니다."),
    { status: 401, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function page(title: string, detail: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PLNA</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#fff;color:#171717;font-family:system-ui,-apple-system,sans-serif;padding:24px}
main{max-width:22rem;text-align:center}h1{font-size:1.05rem;margin:0 0 .5rem}
p{margin:0;font-size:.85rem;line-height:1.6;color:#737373}
@media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#fafafa}p{color:#a3a3a3}}</style>
</head><body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`;
}

export const config = {
  // 정적 파일과 이미지 최적화 요청은 게이트를 태우지 않는다.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
