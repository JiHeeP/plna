# 안드로이드 홈 화면 위젯

PLNA는 PWA라서 안드로이드 네이티브 위젯(AppWidget)을 직접 등록할 수 없다.
대신 서버가 **위젯 이미지(PNG)** 와 **요약 JSON** 을 내보내고, 홈 화면에는 그걸 표시하는
런처 위젯 앱을 쓴다.

## 1. 엔드포인트

| 경로 | 용도 |
|------|------|
| `GET /api/widget` | 요약 JSON. KWGT·Tasker처럼 값을 직접 파싱해 쓰는 경우. |
| `GET /api/widget/image` | 위젯 PNG. URL로 이미지를 불러오는 위젯 앱용. |

### 공통 쿼리 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `token` | (필수) | `PLNA_WIDGET_TOKEN` 값. `Authorization: Bearer <token>` 헤더로 대신 보낼 수도 있다. |
| `date` | 오늘 | `YYYY-MM-DD`. 디버깅용 날짜 고정. |

### 이미지 전용 파라미터

| 파라미터 | 기본값 | 범위 | 설명 |
|----------|--------|------|------|
| `w` | `800` | 320–1600 | 이미지 너비(px). 다른 치수는 여기에 비례해 함께 커진다. |
| `h` | `400` | 160–1600 | 이미지 높이(px). |
| `theme` | `light` | `light` \| `dark` | 어두운 배경화면에는 `dark`. |

PNG는 배경이 투명하고 모서리가 둥글게 처리되어 있어 배경화면 위에 카드처럼 올라간다.

예시:

```
https://<배포주소>/api/widget/image?token=<토큰>&w=1000&h=500&theme=dark
```

## 2. 서버 설정

1. 토큰을 만든다.

   ```bash
   openssl rand -hex 24
   ```

2. Vercel 프로젝트 환경 변수에 넣는다(로컬은 `.env.local`).

   ```
   PLNA_WIDGET_TOKEN=<위에서 만든 값>
   PLNA_WIDGET_CACHE_SECONDS=300
   PLNA_WIDGET_TIMEZONE=Asia/Seoul
   ```

3. 재배포한다. `PLNA_WIDGET_TOKEN`이 없으면 두 엔드포인트는 **503으로 닫혀 있다**(기본값이
   열려 있지 않도록 의도한 동작).

4. 동작을 확인한다.

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' 'https://<배포주소>/api/widget'                  # 401
   curl -s 'https://<배포주소>/api/widget?token=<토큰>' | head -c 400                        # 200 + JSON
   curl -s -o widget.png 'https://<배포주소>/api/widget/image?token=<토큰>' && file widget.png # PNG 800x400
   ```

## 3. 홈 화면에 올리기

### 방법 A. 이미지 위젯 앱 (가장 간단)

"URL에서 이미지를 불러와 위젯으로 띄우는" 종류의 앱이면 무엇이든 된다.
공통적으로 필요한 설정은 세 가지다.

1. 이미지 URL에 `/api/widget/image?token=...` 를 넣는다.
2. 갱신 주기를 정한다 (아래 4번 참고).
3. 탭 동작을 PLNA 주소(`https://<배포주소>/`)를 여는 것으로 지정한다.

위젯 크기에 맞춰 `w`/`h`를 조정한다. 4x2 칸이면 `w=1000&h=500` 정도가 무난하다.
앱마다 메뉴 이름은 다르므로 "이미지 소스 / URL", "새로고침 간격" 항목을 찾으면 된다.

### 방법 B. KWGT (레이아웃을 직접 꾸미고 싶을 때)

KWGT는 네트워크 리소스를 읽을 수 있어 두 가지 방식이 모두 가능하다.

- **이미지로**: 비트맵 요소의 소스를 `/api/widget/image?token=...` URL로 지정한다.
- **값으로**: `/api/widget` JSON을 불러와 필요한 값만 뽑아 직접 배치한다.
  주요 경로는 아래와 같다.

  ```
  summary.habits.done      / summary.habits.total   / summary.habits.percent
  summary.todos.remaining  / summary.todos.next[0]
  summary.weeklyGoal.text  / summary.affirmation
  summary.label            / summary.weekday        / summary.dDay
  ```

네트워크 기능은 KWGT 유료 기능에 속하고 메뉴 구성이 버전마다 달라진다.
정확한 항목 이름은 설치한 버전 기준으로 확인해야 한다.

## 4. 갱신 주기

위젯 앱의 새로고침 간격은 **`PLNA_WIDGET_CACHE_SECONDS`(기본 300초)보다 짧게 잡아도
의미가 없다.** 서버가 그 시간 동안 같은 응답을 돌려주기 때문이다.

- 권장: 위젯 갱신 15~30분, 캐시 300초 유지.
- 더 빠른 반영이 필요하면 `PLNA_WIDGET_CACHE_SECONDS`를 줄이되, 그만큼 Firestore
  읽기가 늘어난다. 이 저장소는 이전에 Firestore 읽기 쿼터 문제를 겪은 적이 있어
  (`app/api/weekly-dashboard/route.ts`의 쿼터 쿨다운 로직) 무작정 줄이지 않는 편이 좋다.

캐시 동작은 응답 헤더로 확인할 수 있다.

```
x-plna-widget-cache: hit | miss | quota-cooldown
```

## 5. 보안

- 토큰은 **위젯 전용**이다. 앱 전체 인증이 아니라 이 두 엔드포인트만 연다.
  노출되면 그날의 습관·할 일·주간 목표 요약이 읽힌다(쓰기는 불가능).
- 위젯 URL에는 토큰이 그대로 들어간다. 스크린샷이나 화면 공유에 URL이 찍히지 않게 한다.
- 유출이 의심되면 `PLNA_WIDGET_TOKEN`을 새로 만들어 교체하고 재배포한 뒤, 위젯 앱의
  URL만 갱신하면 된다.
- 토큰을 `Authorization` 헤더로 보내면 응답은 `private`로 내려가 CDN에 캐시되지 않는다.
  쿼리 파라미터로 보낼 때만 공유 캐시를 허용한다(캐시 키에 토큰이 포함되므로 안전).

## 6. 한계

- **이미지 위젯은 읽기 전용이다.** 탭하면 앱이 열린다.
  체크와 입력까지 하려면 `/widget` 화면을 홈 화면 바로가기로 추가한다(아래 참고).
- 갱신 시점은 안드로이드와 위젯 앱이 정한다. 배터리 최적화가 걸려 있으면 갱신이 지연되거나
  건너뛰어질 수 있다. 위젯 앱을 배터리 최적화 예외로 두면 안정적이다.
- 한글 글리프는 요청 시점에 Google Fonts에서 필요한 글자만 받아 렌더링한다. 서버에서
  `fonts.googleapis.com` / `fonts.gstatic.com` 으로 나가는 요청이 막히면 한글이 빈칸으로
  나오고, 숫자와 진행 바는 정상 표시된다.

## 7. 체크와 입력까지 하려면

`/widget` 은 이미지가 아니라 실제 화면이라, 습관 체크·할 일 추가·할 일 체크가 모두 된다.

```
https://plna.vercel.app/widget
```

크롬에서 열고 **⋮ → 홈 화면에 추가** 하면 홈 화면 아이콘이 생긴다.
바탕화면 이미지 위젯이 "보는 용", 이 화면이 "누르는 용"이다. 토큰은 필요 없다
(`/api/habits`, `/api/todos` 는 메인 앱과 같은 경로를 쓴다).
