# PLNA Dashboard - 주간 대시보드 가이드라인

## 개요

메인 PLNA 앱과 별도로 운영되는 **주간 대시보드 전용 앱**입니다.
주간 습관 달성률, 일일 기록, 주간 목표, 주간 회고를 한 화면에서 확인하고 관리합니다.

- **프레임워크:** Next.js 16 (App Router)
- **언어:** TypeScript 5.9
- **UI:** Tailwind CSS 4 + shadcn/ui + Radix UI
- **DB:** Firebase Firestore (메인 앱과 동일 DB 공유)
- **포트:** 3001 (`next dev --port 3001`)

## 프로젝트 구조

```
dashboard/
├── app/
│   ├── page.tsx            # 메인 페이지 (WeeklyDashboard 렌더)
│   ├── layout.tsx          # 루트 레이아웃 (max-w-4xl)
│   ├── globals.css
│   └── api/
│       ├── weekly-dashboard/route.ts   # 주간 데이터 조회
│       ├── weekly-goals/route.ts       # 주간 목표 CRUD
│       └── weekly-reflections/route.ts # 주간 회고 저장
├── components/
│   ├── weekly-dashboard.tsx  # 핵심 대시보드 컴포넌트
│   └── ui/                   # shadcn/ui 컴포넌트 (button, card, badge, textarea)
└── lib/
    ├── constants.ts          # 필러 라벨
    ├── types.ts              # WeeklyGoal, WeeklyReflection, Pillar 타입
    ├── utils.ts              # 유틸리티 (getISOWeekString 등)
    ├── firebase/
    │   └── server.ts         # Firebase Firestore 서버 클라이언트
    └── supabase/
        └── server.ts         # Firebase compatibility exports
```

## 메인 앱과의 차이점

| 항목         | 메인 앱 (plna)        | 대시보드 (dashboard)       |
|-------------|----------------------|---------------------------|
| 포트         | 3000                 | 3001                      |
| 범위         | 전체 목표 관리 시스템   | 주간 대시보드 전용          |
| 레이아웃     | max-w-md (모바일 퍼스트) | max-w-4xl (데스크톱 중심)  |
| 네비게이션   | BottomNav 포함        | 없음 (단일 페이지)          |
| 의존성       | dnd-kit, recharts 등  | 최소 의존성                 |
| DB          | Firestore             | 동일 Firestore DB 공유      |

## 주요 기능

### 주간 대시보드 테이블
- 월~일 7일간 데이터를 가로 테이블로 표시
- 행: 습관 달성률, 할 일, 잘한 일, 보완할 점, 오늘 한 일
- 첫 진입 시 Firestore에 daily check 데이터가 있는 최신 주차 자동 표시
- 습관 달성률 색상: 70%+ (초록), 40%+ (노랑), 40%- (빨강)

### 주간 초점 목표
- 이번 주 목표 목록 (필러별 Badge)
- 완료/미완료 상태 표시

### 주간 회고
- 잘한 점 / 보완할 점 텍스트 입력
- **자동 저장** (1초 디바운스)
- 저장 상태 표시 (저장 중 / 저장됨 / 저장 실패)

## 환경 변수

```env
# Firebase (메인 앱과 동일)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

## 개발 시 주의사항

- 메인 앱과 **동일한 Firestore DB**를 공유하므로 스키마 변경 시 양쪽 모두 확인
- 데스크톱 중심 레이아웃 (`max-w-4xl`)
- 타입 정의가 메인 앱과 일부 중복됨 (`WeeklyGoal`, `WeeklyReflection`, `Pillar`)
- 주차 네비게이션: `shiftWeek()`, `formatWeekLabel()` 유틸 사용
