# 분석 기록: daily check와 weekly dashboard Firebase 연결 점검

- **일시**: 2026-07-02
- **요구사항 원문**: "okay then i want to correct the connection between daily check and dashboard main database is firebase please check for me"
- **판정**: ⚠️ 조건부 안전

## 요청 요약

메인 앱의 daily check(오늘의 할 일, 습관, 오늘의 기록)가 Firebase Firestore에 저장되고, 주간 dashboard가 같은 Firebase 데이터를 읽는지 점검한다.

## 영향 범위

| 대상 | 영향 수준 | 상세 |
|---|---:|---|
| `components/dashboard/daily-todo.tsx` | 낮음 | `/api/todos`로 `daily_todos` 저장/수정/삭제 |
| `components/dashboard/habit-checklist.tsx` | 낮음 | `/api/habits`로 `habit_logs` 저장/삭제 |
| `components/dashboard/daily-journal.tsx` | 낮음 | `/api/journal`로 `daily_journals` 저장 |
| `app/api/weekly-dashboard/route.ts` | 높음 | 같은 주의 `daily_habits`, `habit_logs`, `daily_journals`, `weekly_goals`, `weekly_reflections` 조회 |
| `dashboard/app/api/weekly-dashboard/route.ts` | 높음 | 독립 dashboard 앱에서 같은 조회 로직 사용 |
| `lib/firebase/firestore-store.ts` | 높음 | Firebase Admin SDK 저장 공통 계층 |
| `dashboard/lib/firebase/firestore-store.ts` | 높음 | dashboard 앱의 Firebase Admin SDK 저장 공통 계층 |

## 점검 결과

| 점검 항목 | 결과 | 근거 |
|---|---|---|
| 인증/권한 제약 | ⚠️ 주의 | 현재 로컬에는 `.env.local`, `dashboard/.env.local`, shell env 모두 Firebase 서버 인증값이 없음. 실제 Firebase 호출 검증은 불가. |
| 데이터 제약 | ✅ 안전 | daily check 저장 컬렉션은 `daily_todos`, `habit_logs`, `daily_journals`; weekly dashboard 조회 컬렉션은 `habit_logs`, `daily_journals` 중심. 현재 dashboard는 `daily_todos`를 표시하지 않는 설계. |
| 운영 제약 | ⚠️ 주의 | main 앱과 dashboard 앱이 별도 Next 앱이므로 두 앱 배포 환경에 같은 Firebase 프로젝트/서비스 계정 환경변수가 필요. |
| 보안 제약 | ✅ 안전 | 서버 API Route가 Firebase Admin SDK를 사용하고, 브라우저 컴포넌트는 `/api/*`만 호출. 비밀키는 `.env.local`/배포 환경변수에만 있어야 함. |
| 검증 제약 | ⚠️ 주의 | 현재 테스트는 Firebase 호환 클라이언트 단위 테스트만 있고, daily check 저장 후 weekly dashboard 집계를 검증하는 테스트는 없음. |
| 기존 약속 | ⚠️ 주의 | API 이름은 기존 Supabase 호환 형태를 유지하지만 내부 DB는 Firebase. |
| 연결 관계 | ✅ 안전 | 컴포넌트 -> API Route -> Firebase Admin 계층 방향이며, 클라이언트가 Firestore를 직접 가져오지 않음. |
| 데이터 모양 | ✅ 안전 | `daily_journals.date`, `habit_logs.habit_id/date`, `weekly_reflections.week` unique/upsert 기준 유지. |
| 과거 기록 | ✅ 안전 | 기존 컬렉션/필드 이름을 바꾸지 않고 같은 Firestore 컬렉션을 사용. |
| 사용자 흐름 | ⚠️ 주의 | daily check 컴포넌트가 API 실패 시 localStorage로 조용히 fallback함. 이 경우 화면에는 저장된 것처럼 보여도 dashboard에는 반영되지 않음. |

## 발견한 문제

1. **Firebase Admin 새 문서 생성 버그**
   - 파일: `lib/firebase/firestore-store.ts`, `dashboard/lib/firebase/firestore-store.ts`
   - 현재 코드:
     - `const docRef = db.collection(collectionName).doc(String(data.id ?? ""));`
   - `data.id`가 없으면 `.doc("")`가 호출된다.
   - 로컬에서 `@google-cloud/firestore`로 확인한 결과 `.doc("")`는 `Value for argument "documentPath" is not a valid resource path. Path must be a non-empty string.` 오류를 낸다.
   - daily check의 새 저장 흐름은 보통 `id` 없이 insert/upsert하므로, 새 `daily_todos`, `habit_logs`, `daily_journals` 생성이 Firebase에 도달하지 못할 수 있다.

2. **weekly dashboard API의 부분 실패 은폐**
   - 파일: `app/api/weekly-dashboard/route.ts`, `dashboard/app/api/weekly-dashboard/route.ts`
   - `habitsRes`, `logsRes`, `journalsRes`, `goalsRes`의 `error`를 확인하지 않고 `data ?? []`로 처리한다.
   - Firebase 조회가 실패해도 dashboard는 빈 데이터처럼 보일 수 있다.

3. **로컬/배포 환경변수 확인 필요**
   - 현재 로컬 작업공간 기준:
     - root `.env.local`: 없음
     - dashboard `.env.local`: 없음
     - `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`: 없음
   - live Firebase 연결 검증은 아직 미확정.

## 기술 요구사항

| 순서 | 작업 유형 | 대상 | 설명 | 의존 순서 |
|---:|---|---|---|---|
| 1 | BUG_FIX | `lib/firebase/firestore-store.ts` | Admin store create에서 `id`가 없으면 `collection.doc()`로 auto ID를 만들도록 수정 | - |
| 2 | BUG_FIX | `dashboard/lib/firebase/firestore-store.ts` | dashboard 앱의 동일 버그 수정 | 1 |
| 3 | BUG_FIX | `app/api/weekly-dashboard/route.ts` | dashboard 집계 API가 개별 Firebase 조회 오류를 500으로 드러내도록 수정 | 1 |
| 4 | BUG_FIX | `dashboard/app/api/weekly-dashboard/route.ts` | dashboard 앱의 동일 API 오류 처리 수정 | 3 |
| 5 | TEST | `tests/*` | Admin store의 no-id create와 daily check -> weekly dashboard 집계 계약을 검증하는 테스트 추가 | 1-4 |
| 6 | CONFIG_CHANGE | `.env.local`, `dashboard/.env.local` 또는 배포 환경 | 두 앱이 같은 Firebase 프로젝트/서비스 계정을 쓰는지 확인 | 1-5 |

## 제시한 안전한 진행안

1. 제품 코드 수정 전, 위 발견 사항을 사용자에게 보고한다.
2. 사용자 확인 후 Firebase Admin no-id 생성 버그를 먼저 수정한다.
3. weekly dashboard API가 Firebase 조회 실패를 숨기지 않도록 오류 처리를 추가한다.
4. 로컬 테스트로 daily check 저장 데이터가 weekly dashboard 집계 형태로 읽히는지 검증한다.
5. Firebase 서버 인증값이 제공되면 실제 Firestore에 새 daily check 데이터를 쓰고 dashboard API에서 같은 데이터를 읽는 수동 검증을 진행한다.

## 구현 후 업데이트

- `daily_todos`도 weekly dashboard API 응답에 포함하도록 연결했다.
- main 앱과 standalone dashboard 앱 모두 weekly table에 `할 일` 행을 표시한다.
- daily check 연결 회귀 테스트가 `daily_todos`, `habit_logs`, `daily_journals`를 함께 검증하도록 확장됐다.
- Firebase CLI 로그인 기반 ADC를 로컬 `.env.local`, `dashboard/.env.local`에 연결해 실제 Firestore read를 검증했다.
- 실제 데이터는 최신 현재 주차(`2026-W27`)가 아니라 `2026-W22`에 있었으므로, 첫 진입 시 Firestore daily check 데이터가 있는 최신 주차를 자동 선택하도록 수정했다.
- API와 브라우저에서 `2026-W22` 데이터 표시를 확인했다.

## 미확정

- Vercel `jiheeparks-projects/plna` 배포 환경에 Firebase 서버 환경변수를 반영했다.
  - `FIREBASE_SERVICE_ACCOUNT_JSON`: Production, Preview
  - `FIREBASE_PROJECT_ID`: Production, Preview, Development
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Production, Preview, Development
- 현재 Vercel 프로젝트의 Root Directory는 `.`이며, 독립 `dashboard/` 앱을 위한 별도 Vercel 프로젝트는 확인되지 않았다.
