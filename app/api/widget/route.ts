import { NextRequest, NextResponse } from "next/server";

import {
  authorizeWidgetRequest,
  getWidgetPayload,
  resolveWidgetDate,
  widgetCacheControl,
} from "@/lib/widget-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 안드로이드 KWGT/Tasker 등에서 파싱해 쓰는 위젯 요약 JSON. */
export async function GET(request: NextRequest) {
  const auth = authorizeWidgetRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const date = resolveWidgetDate(request.nextUrl.searchParams.get("date"));
  const { payload, cacheStatus } = await getWidgetPayload(date);

  const response = NextResponse.json(payload);
  response.headers.set("x-plna-widget-cache", cacheStatus);
  response.headers.set("Cache-Control", widgetCacheControl(auth.via));
  return response;
}
