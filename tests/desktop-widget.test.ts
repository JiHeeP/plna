import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  DESKTOP_WIDGET_ATTRIBUTE,
  DESKTOP_WIDGET_PARAM,
  isDesktopWidget,
} from "../lib/desktop-widget";

function html(attributes: string[]) {
  return { hasAttribute: (name: string) => attributes.includes(name) };
}

describe("desktop widget detection", () => {
  it("treats a browser tab as an ordinary page, so no drag handle is drawn", () => {
    assert.equal(isDesktopWidget({}), false);
    assert.equal(isDesktopWidget({ search: "?date=2026-08-30" }), false);
    assert.equal(isDesktopWidget({ search: "?desktop=0" }), false);
    assert.equal(isDesktopWidget({ documentElement: html([]) }), false);
  });

  it("recognizes the query the widget app appends", () => {
    assert.equal(isDesktopWidget({ search: "?desktop=1" }), true);
    assert.equal(isDesktopWidget({ search: "desktop=1" }), true);
    assert.equal(isDesktopWidget({ search: "?date=2026-08-30&desktop=1" }), true);
  });

  it("recognizes the mark left by the widget app's init script", () => {
    assert.equal(isDesktopWidget({ documentElement: html([DESKTOP_WIDGET_ATTRIBUTE]) }), true);
  });

  it("still recognizes an older widget build that sends neither signal", () => {
    assert.equal(isDesktopWidget({ hasTauriInternals: true }), true);
  });
});

describe("widget window drag handle", () => {
  it("is rendered by the widget page itself, so a deploy fixes it without rebuilding the app", async () => {
    const [page, bar] = await Promise.all([
      readFile("app/widget/page.tsx", "utf8"),
      readFile("components/widget/widget-drag-bar.tsx", "utf8"),
    ]);

    assert.match(page, /<WidgetDragBar \/>/);
    // Tauri 는 이 속성이 붙은 요소에서 시작된 mousedown 만 창 이동으로 다룬다.
    assert.match(bar, /data-tauri-drag-region/);
  });

  it("keeps the widget app in sync with what the page looks for", async () => {
    const [lib, capability] = await Promise.all([
      readFile("desktop-widget/src-tauri/src/lib.rs", "utf8"),
      readFile("desktop-widget/src-tauri/capabilities/default.json", "utf8"),
    ]);

    // 앱이 붙이는 쿼리와 표시가 페이지가 찾는 것과 같아야 손잡이가 나타난다.
    assert.match(lib, new RegExp(`DESKTOP_QUERY_KEY: &str = "${DESKTOP_WIDGET_PARAM}"`));
    assert.match(lib, new RegExp(DESKTOP_WIDGET_ATTRIBUTE));

    // 창 이동은 이 권한이 있어야 요청할 수 있다.
    const permissions = JSON.parse(capability) as {
      permissions: string[];
      remote: { urls: string[] };
    };
    assert.ok(permissions.permissions.includes("core:window:allow-start-dragging"));
    assert.ok(permissions.remote.urls.some((url) => url.includes("localhost")));
  });
});
