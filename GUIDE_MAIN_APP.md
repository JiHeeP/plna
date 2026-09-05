# PLNA - 메인 앱 가이드라인

## 개요

**PLNA**는 2026년 목표 관리를 위한 개인용 모바일 퍼스트 웹앱입니다.
"1-60-100 증명. 매일의 습관이 큰 목표를 이룹니다."를 슬로건으로, 일상의 습관·할 일·기록을 장기 목표와 연결합니다.

- **프레임워크:** Next.js 16 (App Router)
- **언어:** TypeScript 5.9
- **UI:** Tailwind CSS 4 + shadcn/ui + Radix UI
- **DB:** Firebase Firestore
- **AI 인사이트:** Kimi 2.5 (Moonshot AI) — 규칙 기반 폴백 포함
- **기타:** dnd-kit (드래그앤드롭), Recharts (차트), date-fns
- **포트:** 3000 (기본)

## 프로젝트 구조

```
plna/
├── app/                    # Next.js App Router 페이지
│   ├── page.tsx            # 홈 (일일 대시보드)
│   ├── goals/              # 목표 관리
│   ├── stats/              # 통계
│   ├── weekly-dashboard/   # 주간 대시보드
│   ├── conversations/      # 대화 기록
│   └── api/                # API 라우트
│       ├── habits/
│       ├── todos/
│       ├── journal/
│       ├── goals/
│       ├── monthly-goals/
│       ├── weekly-goals/
│       ├── quarterly-goals/
│       ├── sub-goals/
│       ├── conversations/
│       ├── topics/
│       ├── insights/
│       ├── weekly-dashboard/
│       ├── weekly-reflections/
│       └── widget/            # 홈 화면 위젯용 요약 JSON + PNG
├── components/
│   ├── dashboard/          # 홈 화면 위젯
│   ├── goals/              # 목표 관련 컴포넌트
│   ├── conversations/      # 대화 기록 컴포넌트
│   ├── stats/              # 통계 컴포넌트
│   ├── layout/             # 레이아웃 (BottomNav)
│   └── ui/                 # shadcn/ui 기본 컴포넌트
├── lib/
│   ├── constants.ts        # 필러 라벨, 색상, 기본 습관, 확언
│   ├── types.ts            # 전체 타입 정의
│   ├── insights.ts         # AI 인사이트 타입 & 규칙 기반 폴백
│   ├── utils.ts            # 유틸리티 함수
│   ├── firebase/           # Firebase Firestore 연동 (API Route는 Admin SDK 사용)
│   └── supabase/           # Firebase compatibility exports
└── scripts/
    └── check-secrets.mjs   # 시크릿 검증 스크립트
```

## 핵심 개념: 3개의 필러 (Pillar)

모든 목표와 습관은 3개의 축으로 분류됩니다:

| Pillar     | 한국어       | 색상    |
|------------|-------------|---------|
| `career`   | 일 (커리어)  | Blue    |
| `identity` | 나다운 나    | Emerald |
| `assets`   | 자산         | Amber   |

## 주요 기능

### 1. 홈 (일일 대시보드)
- 날짜 탐색 (좌우 화살표)
- 이번 주 목표 표시
- 오늘의 확언 (7개 중 랜덤)
- 오늘의 할 일 (CRUD, 🏫 학교 / 🏠 개인 두 섹션으로 구분해 작성·체크)
- 습관 체크리스트 (7개 기본 습관)
- 오늘의 기록 (일지)
- 스트릭 카운터

### 2. 목표 탭
- **분기 목표** (Quarterly Goals) — 드래그앤드롭 정렬
- **월간 목표** (Monthly Goals)
- **주간 목표** (Weekly Goals)
- **서브 목표** (Sub Goals) — Notion 스타일 보드 UI
- **마일스톤 타임라인** (6개월~10년)
- **수치 목표 트래커** (Numeric Targets)
- **AI 인사이트 카드** — Kimi AI 또는 규칙 기반 폴백

### 3. 대화 기록
- 대화 기록 추가/관리
- 삼성 노트 import 지원
- 대화 주제 관리

### 4. 통계
- 주간 습관 그리드
- 주간 대시보드 (요약 테이블)

### 5. 홈 화면 / 바탕화면 위젯
- `GET /api/widget` — 오늘 요약 JSON (습관 진행률·남은 할 일·이번 주 목표·확언)
- `GET /api/widget/image` — 같은 내용을 그린 투명 배경 PNG (`w`/`h`/`theme` 지원)
- `PLNA_WIDGET_TOKEN` 전용 토큰으로만 접근 가능하며, 미설정 시 503으로 닫힌다
- Firestore 읽기 쿼터를 아끼기 위해 응답을 캐시한다 (`PLNA_WIDGET_CACHE_SECONDS`, 기본 300초)
- `/widget` — 위젯 이미지를 주기적으로 다시 불러오는 페이지 (창 하나를 위젯처럼 띄울 때)
- 설정 방법은 `docs/android-widget.md`(안드로이드), `ops/rainmeter/README.md`(윈도우 바탕화면) 참고

### 6. 주간 대시보드
- 요일별 습관 달성률·할 일·기록 테이블
- 첫 진입 시 Firestore에 daily check 데이터가 있는 최신 주차 자동 표시
- 주간 초점 목표
- 주간 회고 (자동 저장)

## 환경 변수

```env
# Firebase (Firestore)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=

# Kimi 2.5 (AI 인사이트)
KIMI_API_KEY=YOUR_KIMI_API_KEY
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=kimi-k2-0711-preview

# 사이트 프로필 (선택, 비우면 전체 기능 / mom = 가족용 단순 버전)
NEXT_PUBLIC_PLNA_PROFILE=

# 사이트 접근 키 (선택, 미설정 시 게이트 꺼짐)
PLNA_ACCESS_KEY=

# 홈 화면 위젯
PLNA_WIDGET_TOKEN=
PLNA_WIDGET_CACHE_SECONDS=300
PLNA_WIDGET_TIMEZONE=Asia/Seoul

# X Likes Digest (계획 중)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_USER_ID=
X_BEARER_TOKEN=
DIGEST_TIMEZONE=Asia/Seoul
```

## 사이트 프로필 (배포별 화면 구성)

같은 저장소를 여러 Vercel 프로젝트에 배포할 때 `NEXT_PUBLIC_PLNA_PROFILE`로 화면을 갈라 쓴다. `lib/site-profile.ts`가 단일 진입점이다.

| 프로필 | 확언 | 대화 탭 | 목표 화면 | 할 일 카테고리 |
|---|---|---|---|---|
| (비움) | 있음 | 있음 | 전체 | 학교 / 개인 |
| `mom` | 없음 | 없음 (주소로 들어와도 홈으로) | 이번 주·이번 달 목표만 | 개인 / 모임 |

- `NEXT_PUBLIC_` 변수라 **빌드 시점에 박힌다.** 값을 바꾸면 재배포해야 반영된다.
- 할 일 카테고리 키는 `school` / `personal` / `group`. 프로필은 이 중 둘을 고른다. 프로필에 없는 키가 데이터에 남아 있으면 "개인"으로 보인다.
- 새 화면 요소를 프로필에 따라 켜고 끄려면 `SiteFeatures`에 플래그를 하나 추가하고 `SITE_FEATURES.<플래그>`로 감싼다.


PLNA는 1인용이라 로그인이 없다. 대신 `PLNA_ACCESS_KEY`를 설정하면 사이트 전체에 문턱이 생긴다.

- 첫 접속 때 `/login`에서 키를 한 번 입력하면 쿠키(1년)로 기억한다. 쿠키에는 키의 해시만 담긴다.
- 변수가 없으면 게이트가 완전히 꺼진다. 기존 배포는 아무 변화 없음.
- 위젯 API(`/api/widget*`)와 브리핑 API(`/api/briefing*`)는 자체 토큰으로 보호되므로 게이트를 거치지 않는다.
- `/widget` 화면과 데스크톱 위젯은 게이트를 거친다. 위젯 창에서 한 번 로그인하면 그 창의 쿠키에 남는다.
- 구현: `proxy.ts`(요청 차단·리다이렉트), `lib/access-gate.ts`(검증 로직), `app/login`, `app/api/access`.
- 로그아웃: `DELETE /api/access`.

같은 저장소로 여러 배포(예: 가족용 별도 Vercel 프로젝트)를 운영할 때는 배포마다 다른 키를 준다.

## 개발 시 주의사항

- 모바일 퍼스트: `max-w-md` 기본, `lg:max-w-6xl` 데스크톱
- PWA 지원: `manifest.json` 포함
- 한국어 UI: `lang="ko"`
- 날짜 형식: `YYYY-MM-DD` (일일), `YYYY-Www` (주간), `YYYY-MM` (월간), `YYYY-Qn` (분기)
- 브라우저 컴포넌트는 Firestore에 직접 접근하지 않고 `/api/*` Route를 호출
- API Route는 Firebase Admin SDK로 Firestore에 접근
- `"use client"` 컴포넌트 중심 (서버 컴포넌트는 레이아웃 정도)
