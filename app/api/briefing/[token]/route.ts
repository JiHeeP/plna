import { NextRequest } from "next/server";

import { GET as briefingGet } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/briefing/[token] — 토큰을 경로로 받는 브리핑 엔드포인트.
 * 일부 자동화 클라이언트가 ?token= 쿼리 파라미터를 제거하는 문제를 우회한다.
 * 토큰 검증은 /api/briefing 본 라우트가 Authorization 헤더로 수행한다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const url = new URL(request.url);
  url.pathname = "/api/briefing";
  url.searchParams.delete("token");

  const proxied = new NextRequest(url, {
    headers: { authorization: `Bearer ${token}` },
  });

  return briefingGet(proxied);
}
