/**
 * 데스크톱 위젯(Tauri) 창 안에서 열린 페이지인지 판별한다.
 *
 * 위젯 창은 제목표시줄이 없어서(`decorations: false`) 페이지가 직접 드래그
 * 손잡이를 그려 줘야 창을 옮길 수 있다. 브라우저 탭이나 폰 홈 화면에서 열었을
 * 때는 손잡이가 필요 없으므로, 아래 신호 중 하나라도 있을 때만 그린다.
 *
 * - `?desktop=1` — 위젯 앱이 주소에 붙여 준다. 스크립트 주입과 무관하게 항상 온다.
 * - `data-plna-desktop-widget` — 위젯 앱의 초기화 스크립트가 `<html>` 에 남기는 표시.
 * - `window.__TAURI_INTERNALS__` — 쿼리도 표시도 없는 구버전 위젯 앱까지 인식한다.
 */
export const DESKTOP_WIDGET_PARAM = "desktop";
export const DESKTOP_WIDGET_ATTRIBUTE = "data-plna-desktop-widget";

export type DesktopWidgetSignals = {
  /** `window.location.search` (앞의 `?` 는 있어도 없어도 된다). */
  search?: string;
  /** `document.documentElement`. 표시 속성만 읽는다. */
  documentElement?: { hasAttribute(name: string): boolean } | null;
  /** `"__TAURI_INTERNALS__" in window` 결과. */
  hasTauriInternals?: boolean;
};

export function isDesktopWidget({
  search = "",
  documentElement = null,
  hasTauriInternals = false,
}: DesktopWidgetSignals): boolean {
  if (new URLSearchParams(search).get(DESKTOP_WIDGET_PARAM) === "1") return true;
  if (documentElement?.hasAttribute(DESKTOP_WIDGET_ATTRIBUTE)) return true;
  return hasTauriInternals;
}
