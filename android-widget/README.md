# PLNA 안드로이드 홈 화면 위젯

홈 화면에서 **습관을 바로 체크하는** 진짜 위젯(AppWidget)이다.
읽기 전용 이미지 위젯(`docs/android-widget.md`)과 달리 줄을 누르면 서버에 저장된다.

PWA(웹)로는 안드로이드 위젯을 만들 수 없어서 별도의 작은 네이티브 앱으로 두었다.
외부 라이브러리를 쓰지 않고 플랫폼 API(`HttpURLConnection`, `org.json`)만 쓴다.

## 하는 일

| 기능 | 방식 |
|------|------|
| 습관 목록 표시 | `GET /api/widget/habits` (읽기 토큰) |
| 줄을 눌러 체크 | `POST /api/widget/habits` (쓰기 토큰) 후 목록 다시 읽기 |
| 자동 갱신 | 30분 주기 (`updatePeriodMillis`) + 머리말의 ↻ 버튼 |
| 다크 모드 | `values-night` 로 배경·글자색 전환 |
| 설정 | 위젯을 홈 화면에 놓을 때 주소·토큰 입력 (기기 안에만 저장) |

## 준비물

1. **Android Studio** (Ladybug 이상 권장) — <https://developer.android.com/studio>
2. 서버 환경 변수 두 개가 Vercel 에 설정되어 있어야 한다.

   ```
   PLNA_WIDGET_TOKEN=<읽기 토큰>
   PLNA_WIDGET_WRITE_TOKEN=<쓰기 토큰>   # 읽기와 다른 값으로
   ```

   쓰기 토큰이 없으면 목록은 보이지만 체크할 때 503 이 돌아온다.

## 빌드

```bash
cd android-widget
./gradlew assembleDebug          # 윈도우는 gradlew.bat
```

또는 Android Studio 에서 `android-widget` 폴더를 열고 **Run** 을 누른다.
첫 빌드는 Gradle·AGP·Android SDK 를 내려받느라 몇 분 걸린다.

결과물: `app/build/outputs/apk/debug/app-debug.apk`

## 설치

- **USB 연결**: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
- **파일 전달**: APK 를 폰으로 옮기고 탭 → "출처를 알 수 없는 앱" 설치를 허용

디버그 서명이라 플레이 스토어 없이 그대로 쓴다. 개인용이므로 난독화도 꺼 두었다.

## 홈 화면에 올리기

1. 홈 화면 빈 곳을 길게 누르고 **위젯** → **PLNA 위젯** → "오늘의 습관" 을 끌어다 놓는다.
2. 설정 화면이 뜨면 세 칸을 채운다.

   | 칸 | 값 |
   |----|-----|
   | 주소 | `https://plna.vercel.app` |
   | 읽기 토큰 | `PLNA_WIDGET_TOKEN` 값 |
   | 쓰기 토큰 | `PLNA_WIDGET_WRITE_TOKEN` 값 |

3. **저장** 을 누르면 습관 목록이 나타난다. 줄을 누르면 체크가 토글된다.

설정을 다시 바꾸려면 위젯을 지우고 다시 놓는다(설정 화면은 위젯을 놓을 때만 뜬다).

## 구조

```
android-widget/
├── settings.gradle.kts / build.gradle.kts / gradle.properties
├── gradlew, gradlew.bat, gradle/wrapper/   # Gradle 8.9 래퍼
└── app/
    ├── build.gradle.kts                    # AGP 8.7.3, Kotlin 2.0.21, minSdk 26
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/app/plna/widget/
        │   ├── Config.kt                   # 주소·토큰 저장 (SharedPreferences)
        │   ├── PlnaApi.kt                  # /api/widget/habits 클라이언트
        │   ├── HabitWidgetProvider.kt      # 위젯 본체, 머리말, 누름 처리
        │   ├── HabitRemoteViewsService.kt  # 목록의 각 줄 생성
        │   └── ConfigActivity.kt           # 위젯 설정 화면
        └── res/                            # 레이아웃, 색(라이트/다크), 문자열
```

## 알아둘 것

- **체크가 반영되지 않으면** 쓰기 토큰부터 확인한다. 서버가 401 을 주면 토큰이 틀린 것이고,
  503 이면 `PLNA_WIDGET_WRITE_TOKEN` 이 아직 Vercel 에 없는 것이다.
- 토큰은 기기 안(`SharedPreferences`)에만 저장되고 주소창에는 실리지 않는다.
  요청은 `Authorization: Bearer` 헤더로 보낸다.
- 위젯 갱신 주기는 안드로이드가 정한다. 최소 30분이고, 배터리 최적화가 걸려 있으면
  더 밀릴 수 있다. 즉시 갱신하려면 머리말의 ↻ 를 누른다.
- 이 앱은 **리눅스 개발 환경에서 작성해 실제 안드로이드 빌드·실행 검증은 하지 않았다.**
  (SDK 저장소에 접근할 수 없는 환경이었다.) XML 문법과 리소스 참조 일치는 확인했다.
