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

## 2026-07-02 추가 점검: 6월/7월 데일리 기록 미표시

- `plna-60b1d` Firestore의 top-level/subcollection 컬렉션을 실제 조회했다.
- `daily_journals`, `daily_todos`, `habit_logs`의 `date` 기준 최신 기록은 모두 `2026-05-31`이었다.
- 하위 컬렉션은 추가로 발견되지 않았고, 2026-06-01 이후 데일리 계열 기록은 Firestore에 없었다.
- 코드 확인 결과, daily check 컴포넌트들은 API 실패 시 브라우저 `localStorage`에만 저장하고 이후 Firebase로 재동기화하지 않았다.
  - `journal_YYYY-MM-DD`
  - `todos_YYYY-MM-DD`
  - `habits_YYYY-MM-DD`
- 그래서 Vercel Firebase env가 없던 기간에 작성한 기록은 사용자의 브라우저 localStorage에 남고, dashboard API가 보는 Firestore에는 없는 상태가 될 수 있다.

## 2026-07-02 추가 구현

- `LocalDailyBackupSync`를 root layout에 추가해 앱 진입 시 localStorage 데일리 백업을 Firebase로 자동 동기화한다.
- `/api/local-daily-backup/sync`를 추가했다.
  - journal은 `date` 기준 upsert
  - todo는 로컬 id 또는 안정 해시 id 기준 upsert
  - habit check는 `name_en`을 실제 `daily_habits.id`로 매핑해 `habit_logs`에 upsert
- sync 완료 이벤트 후 main weekly dashboard가 최신 데이터 주차를 다시 계산해 로드하도록 수정했다.
- 실제 Firestore에 `2099-12-31` 임시 payload를 쓰고 바로 삭제하는 방식으로 sync API 쓰기/정리 검증을 완료했다.

## 2026-07-02 추가 점검: 다른 원본 후보

- 이 Mac의 Chrome/Chromium/Brave/Edge/Safari/WebKit/Arc 저장소에서 `journal_YYYY-MM-DD`, `todos_YYYY-MM-DD`, `habits_YYYY-MM-DD` 키 이름을 검색했으나 발견되지 않았다.
- Chrome History 기준 PLNA 방문 origin은 `https://plna.vercel.app`이었다.
  - Chrome Default: 최신 방문 `2026-05-01`
  - Chrome Profile 2: 최신 방문 `2026-07-02`
- 접근 가능한 Firebase 프로젝트 3개(`findthething-b5821`, `math-operation-master`, `plna-60b1d`)를 검사했다.
  - daily 계열 데이터는 `plna-60b1d`에만 있고, 2026-06-01 이후 `daily_journals`, `daily_todos`, `habit_logs`는 없었다.
- Vercel에 남아 있는 Supabase env를 임시로 pull해 조회를 시도했으나 Supabase host DNS가 존재하지 않아 원본으로 사용할 수 없었다.

## 2026-07-02 추가 구현: 다른 origin 복구 지원

- `/api/local-daily-backup/sync`에 CORS `OPTIONS`/`POST` 응답을 추가했다.
- `public/daily-backup-recovery.js`를 추가했다.
  - 예전 Vercel URL, localhost, 모바일 브라우저 등 다른 origin에서 실행해도 `https://plna.vercel.app/api/local-daily-backup/sync`로 백업을 보낼 수 있다.
  - 동기화 개수만 alert로 표시하고, 기록 내용은 로그로 출력하지 않는다.

## 2026-07-02 추가 점검: Firestore quota

- production `/api/weekly-dashboard`가 `8 RESOURCE_EXHAUSTED: Quota exceeded.`를 반환했다.
- 원인 완화 조치로 weekly dashboard API를 Supabase 호환 레이어의 전체 컬렉션 스캔 방식에서 직접 Firestore query 방식으로 교체했다.
  - 최신 주차 확인: 각 컬렉션 `orderBy(...).limit(1)`
  - 주간 데이터 확인: `date` range query / `week` equality query
  - `daily_habits`는 소량 컬렉션이므로 한 번만 읽고 필터링
- 새 코드 배포 후에도 Firestore quota 자체가 이미 소진된 상태라 production 응답은 계속 quota error다.
- 남은 외부 상태: Firestore quota reset 또는 Firebase/GCP billing/quota 상향 이후 production API 재검증 필요.

## 2026-07-02 추가 구현: quota/빈 최신 데이터 fallback

- daily 기록 저장 API가 실패하면 브라우저 localStorage 백업을 확실히 남기도록 보강했다.
  - `DailyTodoList`: create/update/delete/reorder 실패 시 `todos_YYYY-MM-DD`에 보존
  - `HabitChecklist`, `WeeklyHabitGrid`: habit PATCH 실패 시 `habits_YYYY-MM-DD`에 보존
  - `DailyJournalCard`: journal 저장 실패 후 이후 저장도 local fallback으로 지속
- localStorage 백업이 변경되면 `plna:local-daily-backup-synced` 이벤트를 발생시켜 dashboard가 다시 읽을 수 있게 했다.
- weekly dashboard는 API 실패 또는 Firestore 최신 주차가 local 백업보다 오래된 경우, local backup을 같은 `DashboardData` 형태로 변환해 표시한다.
- local fallback은 server 데이터를 삭제하거나 덮어쓰지 않는다. 같은 날짜에 local 값이 있으면 화면 표시에서만 local 값을 우선한다.

## 2026-07-02 검증

- `npm test`: 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- `cd dashboard && npm run lint`: 통과
- `cd dashboard && npm run build`: 통과
- `npm run check:secrets`: 통과
- `git diff --check`: 통과

## 남은 한계

- Firestore quota가 이미 소진된 상태에서는 production API read가 계속 500을 반환할 수 있다.
- 이 변경은 그 상태에서도 브라우저 localStorage에 남은 daily 백업을 dashboard에 표시하는 fallback이다.
- 실제 Firebase에 없는 2026-06-01 이후 데이터는 서버에서 새로 만들어낼 수 없고, 사용자가 기록했던 브라우저/기기/origin의 localStorage 백업이 있어야 복구 가능하다.

## 2026-07-02 추가 구현: local backup sync 안정화

- local backup 변경 이벤트와 sync 완료 이벤트를 분리했다.
  - 변경 이벤트: `plna:local-daily-backup-changed`
  - 완료 이벤트: `plna:local-daily-backup-synced`
- daily todo/journal/habit 및 weekly habit grid가 localStorage 백업을 저장하면 변경 이벤트를 발생시킨다.
- `LocalDailyBackupSync`는 변경 이벤트를 들으면 sync를 재시도하되, 같은 payload는 성공 후 다시 전송하지 않는다.
- 같은 payload sync 실패는 10분 backoff를 둔다. Firestore quota 초과 상태에서 같은 백업을 매 페이지 로드마다 반복 전송하는 것을 방지하기 위함이다.
- payload signature는 localStorage key iteration 순서와 무관하게 안정적으로 계산하도록 테스트를 추가했다.

## 2026-07-02 추가 검증

- production `/api/weekly-dashboard`: 500, `source: daily_todos`, `8 RESOURCE_EXHAUSTED: Quota exceeded.`
- production `/api/weekly-dashboard?week=2026-W22`: 500, `source: habit_logs`, `8 RESOURCE_EXHAUSTED: Quota exceeded.`
- 이 Mac의 Chrome Local Storage/IndexedDB/Session Storage 파일에서 `journal_YYYY-MM-DD`, `todos_YYYY-MM-DD`, `habits_YYYY-MM-DD` 키는 발견되지 않았다.
- local browser smoke:
  - API 500 모킹 상태에서 `2026-07-01` local backup이 weekly dashboard `6/29 ~ 7/5`에 표시됨
  - sync 성공 후 같은 payload로 reload해도 `/api/local-daily-backup/sync` 재호출 없음
