"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_REFRESH_SECONDS = 300;
const MIN_REFRESH_SECONDS = 30;

type ReadableParams = { get(key: string): string | null };

function readNumber(params: ReadableParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function WidgetView() {
  const params = useSearchParams();
  // tick이 바뀔 때마다 이미지 주소가 달라져 브라우저가 새로 받아온다.
  const [tick, setTick] = useState(0);

  const token = params.get("token")?.trim() ?? "";
  const refreshSeconds = Math.max(
    MIN_REFRESH_SECONDS,
    readNumber(params, "refresh", DEFAULT_REFRESH_SECONDS),
  );

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => setTick((value) => value + 1), refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [token, refreshSeconds]);

  if (!token) {
    return (
      <div className="flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <p>
          주소 끝에 <code className="mx-1 rounded bg-muted px-1.5 py-0.5">?token=발급받은값</code>
          을 붙여야 합니다.
        </p>
      </div>
    );
  }

  const imageParams = new URLSearchParams({
    token,
    w: String(readNumber(params, "w", 1000)),
    h: String(readNumber(params, "h", 500)),
    theme: params.get("theme") === "dark" ? "dark" : "light",
    _: String(tick),
  });

  return (
    <div className="flex items-center justify-center p-2">
      {/* 서버가 완성된 이미지를 그려 주므로 next/image 최적화를 거치지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/widget/image?${imageParams}`}
        alt="오늘의 PLNA 요약"
        className="h-auto w-full max-w-3xl"
      />
    </div>
  );
}

/**
 * 위젯 이미지를 주기적으로 다시 불러오는 페이지.
 * 이미지 주소를 브라우저에 그냥 띄우면 갱신되지 않아서, 별도 프로그램 없이 창 하나를
 * 위젯처럼 띄워 두려는 경우에 쓴다. 인증은 전부 /api/widget/image가 처리하고
 * 이 페이지는 토큰을 전달하기만 한다.
 */
export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetView />
    </Suspense>
  );
}
