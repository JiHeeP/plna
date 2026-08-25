# PLNA 데스크톱 위젯 (Tauri)

크롬 앱 모드 + `ops/desktop/pin-widget.ps1` 없이, 진짜 위젯처럼 동작하는
데스크톱 앱이다. `https://plna.vercel.app/widget` 페이지를 얇은 네이티브 창에
담아서 띄운다 — 웹 위젯 코드는 그대로 재사용한다.

## 하는 일

| 기능 | 방식 |
|------|------|
| 프레임 없는 창 | 제목표시줄·테두리 없음 (`decorations: false`) |
| 항상 위 | `alwaysOnTop` — 다른 창에 가려지지 않음 |
| 작업표시줄 숨김 | `skipTaskbar` — 앱 목록에 안 뜸 |
| 창 이동 | 위젯 **맨 위 24px 투명 바**를 잡고 드래그 |
| 닫기(X) | 종료가 아니라 트레이로 숨김 |
| 트레이 아이콘 | 보이기/숨기기 · 로그인 시 자동 실행 토글 · 종료 |
| 위치·크기 기억 | `tauri-plugin-window-state` 가 자동 저장/복원 |
| 중복 실행 방지 | 두 번 실행하면 기존 창을 앞으로 가져옴 |

로그인 세션은 WebView2 프로필에 저장되므로 **첫 실행 때 한 번만 로그인**하면 된다.

## 빌드 준비물 (Windows)

1. **Rust** — <https://rustup.rs> 에서 설치 (기본 옵션 그대로)
2. **Node.js** — 이미 있음 (메인 앱과 동일)
3. **WebView2 런타임** — Windows 11 은 기본 내장, Windows 10 은 대부분 설치되어 있음
4. Visual Studio **C++ Build Tools** — rustup 설치 중에 안내가 나오면 함께 설치

## 실행 / 빌드

```powershell
cd desktop-widget
npm install          # @tauri-apps/cli 설치
npm run dev          # 개발 실행 (컴파일 후 위젯 창이 뜸, 첫 빌드는 몇 분 걸림)
npm run build        # 배포용 빌드 → src-tauri/target/release/bundle/nsis/*.exe 설치 파일
```

로컬 Next.js 서버로 띄워 보고 싶으면:

```powershell
$env:PLNA_WIDGET_URL = "http://localhost:3000/widget"
npm run dev
```

## 구조

```
desktop-widget/
├── package.json            # tauri CLI 실행용
└── src-tauri/
    ├── tauri.conf.json     # 창은 코드에서 만들므로 windows: []
    ├── capabilities/       # 원격 페이지(plna.vercel.app)에 드래그 권한 부여
    ├── icons/              # scripts 로 생성한 앱 아이콘 (#0f172a + P)
    └── src/lib.rs          # 창 생성, 트레이, 자동 실행, 닫기→숨김 로직
```

## 참고

- 창 크기 기본값은 420×620 (기존 `pin-widget.ps1` 과 동일). 모서리를 잡고
  조절하면 다음 실행 때 그 크기로 복원된다.
- "로그인 시 자동 실행"은 트레이 메뉴에서 켜고 끈다 (레지스트리 Run 키 사용).
  README 의 시작프로그램 등록 수동 절차는 더 이상 필요 없다.
- 위젯 URL 을 바꾸려면 `src-tauri/src/lib.rs` 의 `WIDGET_URL` 을 수정하거나
  `PLNA_WIDGET_URL` 환경 변수를 쓴다.
