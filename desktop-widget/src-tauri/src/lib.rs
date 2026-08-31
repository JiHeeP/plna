use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, Url, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_window_state::StateFlags;

/// 위젯으로 띄울 페이지. 로컬 개발 서버로 바꿔 볼 때는
/// `PLNA_WIDGET_URL=http://localhost:3000/widget` 처럼 환경 변수로 덮어쓴다.
const WIDGET_URL: &str = "https://plna.vercel.app/widget";

/// 위젯 창에서 열렸다고 페이지에 알려 주는 쿼리. `/widget` 페이지는 이 값을 보고
/// 맨 위에 이동 손잡이(`data-tauri-drag-region`)를 그린다.
const DESKTOP_QUERY_KEY: &str = "desktop";
const DESKTOP_QUERY_VALUE: &str = "1";

/// 앱 접근 게이트가 읽는 쿼리 이름. 서버가 쿠키를 심고 주소에서 지운다.
const ACCESS_QUERY_KEY: &str = "key";

/// 창을 되돌려 놓을 때 화면 가장자리에서 띄우는 여백(논리 픽셀).
const SNAP_MARGIN: f64 = 24.0;

/// 창에 제목표시줄이 없으므로 페이지 맨 위 줄을 잡고 끌어 옮긴다.
///
/// 손잡이는 `/widget` 페이지가 직접 그리지만(배포만으로 갱신된다), 이 스크립트가
/// 세 가지를 더 챙긴다.
///
/// 1. `<html>` 에 표시를 남겨, 쿼리 없이 열린 페이지도 위젯 창임을 알 수 있게 한다.
/// 2. `data-tauri-drag-region` 요소의 mousedown 에서 창 이동을 직접 요청한다.
///    Tauri 기본 처리기가 있으면 그쪽이 먼저 잡고 전파를 끊으므로 중복되지 않는다.
/// 3. 페이지가 손잡이를 그리지 않으면(구버전 배포) 대신 하나 얹어 준다.
const DRAG_BAR_SCRIPT: &str = r#"
(function () {
  var FLAG = 'data-plna-desktop-widget';
  var FALLBACK_ID = '__plna_drag_bar';
  var SELECTOR = '[data-tauri-drag-region]';

  function markWidgetWindow() {
    if (document.documentElement) document.documentElement.setAttribute(FLAG, '');
  }

  function startDragging() {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return;
    try {
      var result = internals.invoke('plugin:window|start_dragging');
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (error) {
      /* 창 이동 권한이 없으면 조용히 넘어간다. */
    }
  }

  document.addEventListener('mousedown', function (event) {
    if (event.button !== 0) return;
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest(SELECTOR)) return;
    event.preventDefault();
    startDragging();
  });

  function buildFallbackBar() {
    var bar = document.createElement('div');
    bar.id = FALLBACK_ID;
    bar.setAttribute('data-tauri-drag-region', 'deep');
    bar.title = '여기를 잡고 끌면 위젯 창이 움직입니다';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:28px;' +
      'z-index:2147483647;cursor:grab;background:transparent;' +
      'display:flex;justify-content:center;align-items:flex-start;padding-top:7px;';
    var pill = document.createElement('div');
    pill.setAttribute('data-tauri-drag-region', '');
    pill.style.cssText = 'width:56px;height:6px;border-radius:3px;background:rgba(100,116,139,0.4);';
    bar.appendChild(pill);
    bar.addEventListener('mouseenter', function () {
      pill.style.background = 'rgba(100,116,139,0.7)';
    });
    bar.addEventListener('mouseleave', function () {
      pill.style.background = 'rgba(100,116,139,0.4)';
    });
    return bar;
  }

  // 페이지가 그린 손잡이가 있으면 그것을 쓰고, 없으면 우리 것을 얹는다.
  function syncFallbackBar() {
    if (!document.body) return;
    var fallback = document.getElementById(FALLBACK_ID);
    var pageBar = null;
    var candidates = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < candidates.length; i += 1) {
      if (!fallback || !fallback.contains(candidates[i])) {
        pageBar = candidates[i];
        break;
      }
    }
    if (pageBar && fallback) fallback.remove();
    if (!pageBar && !fallback) document.body.appendChild(buildFallbackBar());
  }

  function start() {
    markWidgetWindow();
    syncFallbackBar();
    // 페이지 손잡이는 하이드레이션 뒤에 나타나므로 잠시 지켜본다.
    var checks = 0;
    var timer = setInterval(function () {
      syncFallbackBar();
      checks += 1;
      if (checks >= 10) clearInterval(timer);
    }, 1000);
  }

  markWidgetWindow();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
"#;

/// 앱 접근 게이트를 통과할 키. 창에는 주소창이 없으므로 매직 링크를 직접 열 수 없다.
/// 그래서 첫 실행 때만 `plna-widget.exe --key=<키>` 로 넘기거나 `PLNA_ACCESS_KEY` 를 쓴다.
/// 서버가 쿠키를 심어 주면 그 뒤로는 필요 없다 (쿠키는 WebView2 프로필에 남는다).
fn access_key() -> Option<String> {
    let from_args = std::env::args().find_map(|arg| {
        arg.strip_prefix("--key=").map(|value| value.to_owned())
    });
    from_args
        .or_else(|| std::env::var("PLNA_ACCESS_KEY").ok())
        .map(|key| key.trim().to_owned())
        .filter(|key| !key.is_empty())
}

/// 위젯 주소에 `desktop=1` 을 붙인다. 이미 붙어 있으면 그대로 둔다.
fn widget_url() -> Url {
    let raw = std::env::var("PLNA_WIDGET_URL").unwrap_or_else(|_| WIDGET_URL.into());
    let mut url: Url = raw.parse().expect("PLNA_WIDGET_URL 이 올바른 URL 이 아님");
    let already_marked = url
        .query_pairs()
        .any(|(key, value)| key == DESKTOP_QUERY_KEY && value == DESKTOP_QUERY_VALUE);
    if !already_marked {
        url.query_pairs_mut()
            .append_pair(DESKTOP_QUERY_KEY, DESKTOP_QUERY_VALUE);
    }
    if let Some(key) = access_key() {
        url.query_pairs_mut().append_pair(ACCESS_QUERY_KEY, &key);
    }
    url
}

/// 창을 현재 모니터 오른쪽 위로 되돌린다.
/// 창을 화면 밖으로 밀어 놨거나 드래그가 막혔을 때 쓰는 탈출구다.
fn snap_to_corner<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let margin = (SNAP_MARGIN * monitor.scale_factor()).round() as i32;
    let area = monitor.size();
    let origin = monitor.position();
    let x = origin.x + (area.width as i32 - size.width as i32 - margin).max(0);
    let y = origin.y + margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

pub fn run() {
    tauri::Builder::default()
        // 두 번 실행하면 새 프로세스 대신 기존 창을 앞으로 가져온다.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // 창 위치·크기를 저장했다가 다음 실행 때 복원한다.
        // VISIBLE 은 제외한다 — 숨긴 채로 종료해도 다음 실행 땐 창이 보여야 한다.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(widget_url()))
                .title("PLNA")
                .inner_size(420.0, 620.0)
                .min_inner_size(280.0, 320.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .maximizable(false)
                .initialization_script(DRAG_BAR_SCRIPT)
                .build()?;

            let toggle = MenuItem::with_id(app, "toggle", "보이기 / 숨기기", true, None::<&str>)?;
            let snap = MenuItem::with_id(app, "snap", "화면 오른쪽 위로 이동", true, None::<&str>)?;
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "로그인 시 자동 실행",
                true,
                autostart_on,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &snap, &autostart, &quit])?;

            let autostart_item = autostart.clone();
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("번들 아이콘 없음").clone())
                .tooltip("PLNA 위젯")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "snap" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            snap_to_corner(&window);
                            let _ = window.set_focus();
                        }
                    }
                    "autostart" => {
                        let launcher = app.autolaunch();
                        if launcher.is_enabled().unwrap_or(false) {
                            let _ = launcher.disable();
                            let _ = autostart_item.set_checked(false);
                        } else {
                            let _ = launcher.enable();
                            let _ = autostart_item.set_checked(true);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        // X(닫기)를 눌러도 종료하지 않고 트레이로 숨긴다. 종료는 트레이 메뉴에서.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("PLNA 위젯 실행 실패");
}
