"use client";

import { useSyncExternalStore } from "react";
import { isDesktopWidget } from "@/lib/desktop-widget";

// 위젯 창인지 아닌지는 창을 띄운 순간 정해지고 그 뒤로 바뀌지 않는다.
// 서버 렌더에서는 알 수 없으므로 클라이언트 스냅샷으로만 읽는다.
const neverChanges = () => () => {};
const readServer = () => false;

function readClient() {
  return isDesktopWidget({
    search: window.location.search,
    documentElement: document.documentElement,
    hasTauriInternals: "__TAURI_INTERNALS__" in window,
  });
}

/**
 * 데스크톱 위젯 창을 옮기는 손잡이.
 *
 * 위젯 창에는 제목표시줄이 없으므로 잡을 곳이 없다. 화면 맨 위 28px 줄을
 * `data-tauri-drag-region` 으로 표시해 두면, 위젯 앱이 그 줄에서 시작된
 * mousedown 을 받아 창을 끌어 준다. 손잡이를 페이지가 직접 그리므로
 * 위젯 앱을 다시 설치하지 않아도 배포만으로 손잡이가 나타난다.
 */
export function WidgetDragBar() {
  const desktop = useSyncExternalStore(neverChanges, readClient, readServer);

  if (!desktop) return null;

  return (
    <>
      {/* "deep" 은 줄 안 어디를 눌러도 드래그가 시작된다는 뜻. 구버전 위젯 앱은
          속성이 붙어 있는지만 보므로 거기서도 그대로 동작한다. */}
      <div
        data-tauri-drag-region="deep"
        title="여기를 잡고 끌면 위젯 창이 움직입니다"
        className="group fixed inset-x-0 top-0 z-50 flex h-7 cursor-grab select-none items-center justify-center border-b bg-background/95 backdrop-blur active:cursor-grabbing"
      >
        {/* 잡을 곳이라는 표시. 클릭 대상이 되어도 드래그가 시작되도록 같은 속성을 붙인다. */}
        <div
          data-tauri-drag-region
          className="h-1.5 w-14 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-muted-foreground/70"
        />
      </div>
      {/* 손잡이가 fixed 라 내용을 덮으므로 같은 높이만큼 자리를 비운다. */}
      <div className="h-7" aria-hidden />
    </>
  );
}
