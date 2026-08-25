use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 위젯으로 띄울 페이지. 로컬 개발 서버로 바꿔 볼 때는
/// `PLNA_WIDGET_URL=http://localhost:3000/widget` 처럼 환경 변수로 덮어쓴다.
const WIDGET_URL: &str = "https://plna.vercel.app/widget";

/// 창에 제목표시줄이 없으므로, 페이지 맨 위에 투명한 드래그 바를 얹는다.
/// `data-tauri-drag-region` 이 붙은 요소를 잡고 끌면 Tauri 가 창을 옮겨 준다.
const DRAG_BAR_SCRIPT: &str = r#"
(function () {
  function addDragBar() {
    if (document.getElementById('__plna_drag_bar')) return;
    var bar = document.createElement('div');
    bar.id = '__plna_drag_bar';
    bar.setAttribute('data-tauri-drag-region', '');
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:24px;' +
      'z-index:2147483647;cursor:grab;background:transparent;';
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDragBar);
  } else {
    addDragBar();
  }
})();
"#;

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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let url = std::env::var("PLNA_WIDGET_URL").unwrap_or_else(|_| WIDGET_URL.into());

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("PLNA_WIDGET_URL 이 올바른 URL 이 아님")),
            )
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
            let menu = Menu::with_items(app, &[&toggle, &autostart, &quit])?;

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
