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

## 2026-07-02 추가 구현: quota 독립 import 복구 경로

- `/local-daily-backup/import` 페이지를 추가했다.
- `public/daily-backup-recovery.js`는 더 이상 다른 origin에서 곧바로 Firestore sync API만 호출하지 않는다.
  - 먼저 `https://plna.vercel.app/local-daily-backup/import`를 열고 `postMessage`로 백업 payload를 넘긴다.
  - import 페이지가 `plna.vercel.app` origin의 localStorage에 `journal_YYYY-MM-DD`, `todos_YYYY-MM-DD`, `habits_YYYY-MM-DD` 키를 복원한다.
  - 이후 dashboard fallback이 즉시 읽고, Firebase sync는 앱의 기존 local backup sync가 재시도한다.
- 이 경로는 Firestore quota가 초과된 상태에서도 대시보드 표시 복구가 가능하다.

## 2026-07-02 추가 검증: import 복구

- local browser smoke:
  - `/local-daily-backup/import`에 recovery payload를 `postMessage`로 전달
  - localStorage daily backup 키 3종 생성 확인
  - `/api/local-daily-backup/sync`를 500으로 모킹해도 `/weekly-dashboard`에 `2026-W27` local backup 표시 확인
  - sync 실패 상태가 `plna_local_daily_backup_sync_state`에 기록되는 것 확인

## 2026-07-02 추가 구현: dashboard remote read cooldown

- weekly dashboard remote API 실패를 `plna_weekly_dashboard_remote_error_state`에 기록한다.
- local daily backup이 있는 상태에서 remote 실패가 10분 이내이면 `/api/weekly-dashboard` 재호출을 건너뛰고 local fallback을 바로 표시한다.
- local backup이 없으면 기존처럼 remote API를 호출한다. Firebase quota가 회복됐을 때 서버 데이터를 다시 읽을 수 있게 하기 위함이다.
- remote API가 성공하면 cooldown 상태를 삭제한다.

## 2026-07-02 추가 검증: dashboard cooldown

- local browser smoke:
  - `/api/weekly-dashboard`를 500으로 모킹
  - localStorage에 `2026-07-01` daily backup 입력
  - 첫 로드에서 local fallback 표시 확인
  - reload 후 `/api/weekly-dashboard` 호출 횟수가 1회에 머문 것 확인
  - `plna_weekly_dashboard_remote_error_state.failed_at` 기록 확인

## 2026-07-02 추가 구현: local backup status page

- `/local-daily-backup/status` 페이지를 추가했다.
- 현재 브라우저의 local daily backup 개수(`journal`, `todo`, `habit`)와 최신 local week를 표시한다.
- Firebase sync 실패 상태, dashboard remote read 실패 상태, 마지막 sync 시간을 표시한다.
- local backup이 있으면 sync backoff 상태를 지우고 재시도를 요청할 수 있다.
- dashboard 오류 화면에서 status 페이지로 이동하는 버튼을 추가했다.
- 다른 브라우저/기기에서 실행할 recovery bookmarklet을 복사할 수 있게 했다.

## 2026-07-02 추가 검증: status page

- local browser smoke:
  - localStorage에 `2026-07-01` daily backup 입력
  - `/api/weekly-dashboard`, `/api/local-daily-backup/sync`를 500으로 모킹
  - `/local-daily-backup/status`에서 backup count, `2026-W27`, remote/sync 실패 상태 표시 확인
  - dashboard 오류 화면의 `백업 상태` 버튼이 status 페이지로 이동하는 것 확인

## 2026-07-02 추가 점검: 실제 Chrome local backup 상태

- 사용자의 Chrome 열린 PLNA 탭(`https://plna.vercel.app/`)을 확인했다.
- `https://plna.vercel.app/local-daily-backup/status` 화면 기준 현재 Chrome profile의 local daily backup은 0건이었다.
  - 기록: 0
  - 할 일: 0
  - 습관: 0
- Chrome 디스크 저장소에서도 `journal_2026-*`, `todos_2026-*`, `habits_2026-*` key는 발견되지 않았다.
- Firestore 직접 조회는 현재도 `8 RESOURCE_EXHAUSTED: Quota exceeded.`로 실패했다.

## 2026-07-02 추가 구현: local sync read 절감

- `/api/local-daily-backup/sync`가 habit backup이 없을 때도 `daily_habits`를 읽던 동작을 제거했다.
- journal/todo만 있는 local backup은 불필요한 Firestore read 없이 upsert를 시도할 수 있다.
- habit backup이 있을 때만 `daily_habits`를 읽어 `name_en`에서 habit id로 매핑한다.

## 2026-07-02 추가 구현: dashboard 기본 주차 daily 우선

- 루트 앱과 `dashboard/` 앱의 `/api/weekly-dashboard` 기본 주차 선택을 변경했다.
- 기존에는 daily 기록 최신 주차와 weekly goal/reflection 최신 주차를 모두 섞어서 가장 큰 주차를 골랐다.
  - 이 경우 weekly goal만 있는 최신 주로 이동해 daily 기록이 있는 주차가 빈 화면처럼 보일 수 있다.
- 변경 후에는 `habit_logs`, `daily_journals`, `daily_todos` 중 daily 기록이 있는 최신 주차를 먼저 선택한다.

## 2026-07-02 추가 점검: 특정 기간 daily 기록 미표시 원인 후보

- git history 기준 localStorage daily backup key는 과거에도 현재와 같은 형식이었다.
  - `journal_YYYY-MM-DD`
  - `todos_YYYY-MM-DD`
  - `habits_YYYY-MM-DD`
- 별도 legacy key 이름은 발견되지 않았다.
- production `/api/weekly-dashboard`와 로컬 Admin SDK 직접 read는 모두 `8 RESOURCE_EXHAUSTED: Quota exceeded.`로 실패했다.
- 따라서 현재 상태에서는 “해당 기간 daily 기록이 Firebase에 없다”고 확정할 수 없다. Firestore quota가 회복되어야 실제 문서 존재 여부를 재검증할 수 있다.

## 2026-07-02 추가 구현: standalone dashboard Firestore query 계층 동기화

- root 앱의 Firebase 호환 계층은 이미 `query()` 기반 필터 조회로 최적화되어 있었지만, `dashboard/` 앱의 복사본은 여전히 `list()` 전체 스캔 후 메모리 필터링을 사용하고 있었다.
- `dashboard/lib/firebase/supabase-compatible.ts`에 root와 같은 filtered query 경로를 추가했다.
  - `date`, `week`, `id`, `is_active` 등 dashboard 주요 필터를 backend query로 먼저 전달한다.
  - `upsert`, `update`, `delete`, backlog promotion도 가능한 경우 전체 스캔 대신 후보 row만 조회한다.
- `dashboard/lib/firebase/firestore-store.ts`에 root와 같은 Firestore `where`/`limit` query를 추가했다.
  - `date` string 저장 문서와 Firestore Timestamp/Date 저장 문서를 모두 조회하도록 date filter variant를 유지한다.
- standalone dashboard 복사본이 다시 전체 컬렉션 스캔으로 퇴행하지 않도록 회귀 테스트를 추가했다.
- daily 기록이 전혀 없을 때만 weekly goal/reflection 주차를 fallback으로 사용한다.
- 기본 로드 시 weekly goal/reflection 최신 주차 조회는 daily 기록이 없을 때만 수행하므로 Firestore read도 줄어든다.

## 2026-07-02 추가 구현: quota/부분 실패 시 dashboard partial response

- `/api/weekly-dashboard`가 한 컬렉션 read 실패만으로 전체 응답을 500 처리하던 구조를 완화했다.
- root 앱과 `dashboard/` 앱 모두 성공한 컬렉션 데이터는 유지하고, 실패한 source는 `warnings` 배열로 반환한다.
- 기본 주차 계산 중 일부 latest read가 실패해도 성공한 latest 값으로 주차를 계산한다.
- 모든 latest read가 실패하면 현재 주차를 fallback으로 사용해 local backup merge/표시 경로가 계속 살아 있게 했다.
- UI는 `warnings`가 있는 200 응답을 받으면 `일부 데이터 누락 가능` 상태를 표시한다.
- 로컬 검증 결과, 현재 Firestore quota 초과 상태에서도 `/api/weekly-dashboard`는 200을 반환하고 `warnings`에 quota 실패 source를 포함했다.

## 2026-07-02 추가 검증: dashboard 기본 주차

- `resolveLatestDashboardWeek` 순수 함수 테스트를 추가했다.
  - daily 기록 주차가 있으면 더 최신 weekly goal/reflection 주차보다 daily 주차를 우선한다.
  - `daily_todos`만 있어도 daily dashboard 기록으로 간주한다.
  - daily 기록이 없을 때만 weekly goal/reflection을 사용한다.

## 2026-07-02 추가 구현: daily 입력 선로컬 백업

- daily journal/todo/habit 변경은 서버 API 호출 전 localStorage 백업을 먼저 갱신하도록 바꿨다.
- Firebase API가 성공하더라도 같은 local backup을 최신 상태로 유지한다.
- 새 todo는 `local_*` id를 먼저 만들고 `/api/todos` POST에도 전달해, 이후 local backup sync가 같은 항목을 중복 생성할 가능성을 줄였다.
- `LocalDailyBackupSync`는 backup 변경 이벤트를 1초 debounce해서 journal 입력 중 과도한 sync 호출을 줄인다.
- 이 변경의 목적은 Firestore quota/일시 장애/응답 성공 후 조회 불일치가 있어도 브라우저 백업과 dashboard fallback이 먼저 살아 있게 하는 것이다.

## 2026-07-02 추가 검증: 선로컬 백업

- explicit id를 가진 local-first `daily_todos` insert가 id를 보존하는 테스트를 추가했다.

## 2026-07-02 추가 구현: load 시 local backup 우선

- daily 화면이 서버 API `200` 응답을 받더라도 같은 날짜의 local backup이 있으면 local backup을 우선 표시하도록 바꿨다.
- 대상:
  - `DailyTodoList`
  - `DailyJournalCard`
  - `HabitChecklist`
  - `WeeklyHabitGrid`
- 이유:
  - 서버가 빈 배열/null을 반환하면 기존에는 브라우저에 남은 백업이 있어도 빈 화면으로 보일 수 있었다.
  - 사용자가 todo를 전부 지우거나 journal 내용을 비운 상태도 최신 의도일 수 있으므로, local key가 존재하면 빈 값도 local 기준으로 인정한다.
- remote 데이터만 있고 local backup이 없는 경우에는 remote 데이터를 local backup으로 캐시해 이후 dashboard fallback이 읽을 수 있게 했다.

## 2026-07-02 추가 점검: 사용자의 "Firebase에는 많은데 왜 대시보드만 비는가" 질문

- production `https://plna.vercel.app/api/weekly-dashboard`를 다시 호출했다.
  - 결과: `daily_journals` source에서 `8 RESOURCE_EXHAUSTED: Quota exceeded.`
- 로컬 Admin SDK 조회도 `.env.local`의 `GOOGLE_APPLICATION_CREDENTIALS` 기준으로 다시 시도했다.
  - `daily_journals`, `daily_todos`, `habit_logs`, `weekly_goals`, `weekly_reflections` 모두 `8 RESOURCE_EXHAUSTED: Quota exceeded.`
- 따라서 현재 시점에는 Firestore 실제 최신 날짜를 새로 읽어 재확인할 수 없다.
- 이전에 quota가 막히기 전 성공한 실측 기준으로는 `plna-60b1d`의 daily 계열 최신 날짜가 모두 `2026-05-31`이었다.
- 이 상태에서 대시보드가 빈 화면으로 보이는 직접 원인은 원격 read 실패 시 standalone `dashboard/` 앱이 local backup fallback을 사용하지 않던 점이다.

## 2026-07-02 추가 구현: standalone dashboard local fallback

- `dashboard/components/weekly-dashboard.tsx`에 루트 `/weekly-dashboard`와 같은 local backup fallback을 적용했다.
  - localStorage의 `journal_YYYY-MM-DD`, `todos_YYYY-MM-DD`, `habits_YYYY-MM-DD`를 읽어 주간 표로 변환한다.
  - Firebase 원격 API가 quota/error로 실패하면 local backup이 있는 주차를 표시한다.
  - 최근 원격 실패 상태를 10분 동안 기억해 local backup이 있을 때 불필요한 재호출을 줄인다.
  - local backup 변경/동기화 이벤트를 받으면 최신 local week 기준으로 다시 로드한다.
- `dashboard/lib/local-daily-backup.ts`를 추가했다.
  - `dashboard/` 앱은 Turbopack root가 `dashboard/`로 제한되어 루트 `lib/local-daily-backup.ts`를 직접 re-export할 수 없어 앱 내부 helper로 분리했다.
- `tests/local-daily-backup.test.ts`에 standalone dashboard fallback 호환 테스트를 추가했다.

## 2026-07-02 추가 검증: standalone dashboard local fallback

- `npm test`: 29개 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- `cd dashboard && npm run lint`: 통과
- `cd dashboard && npm run build`: 통과
- `npm run check:secrets`: 통과
- `git diff --check`: 통과

## 2026-07-02 추가 점검: daily API read 경로

- production `/api/weekly-dashboard`와 로컬 Admin SDK 직접 조회가 계속 `8 RESOURCE_EXHAUSTED: Quota exceeded.`로 실패했다.
- 그래서 실제 이번주/지난주 daily 데이터가 Firestore에 있는지 새로 증명하지는 못했다.
- 코드 점검 결과, `/api/todos`, `/api/journal`, `/api/habits`, `/api/local-daily-backup/sync`, ops 일부 API가 Supabase 호환 레이어를 통해 Firestore 컬렉션 전체를 읽고 JS에서 필터링하는 구조였다.
  - 예: `daily_todos` 특정 날짜 1일 조회도 기존에는 `daily_todos` 전체 read 후 `date` 필터.
  - 이 구조는 기록 수가 늘수록 Firestore read를 많이 쓰고, quota 소진 시 특정 날짜 조회도 같이 막힌다.

## 2026-07-02 추가 구현: Supabase 호환 레이어 filtered query

- `FirestoreCompatStore`에 optional `query(collectionName, { filters })`를 추가했다.
- Admin/Web Firestore store가 가능한 경우 Firestore `where(...)`로 먼저 후보 row를 좁히고, 기존 정렬/복합 필터는 기존 JS 로직으로 마무리한다.
- 안전을 위해 backend query는 보수적으로 선택한다.
  - `id == ...`
  - `date ==/gte/lte ...`
  - `week == ...`
  - `is_active == ...`
  - 그 외에는 단일 필드 또는 첫 equality 필터만 backend로 보낸다.
- `date` 필드는 기존 데이터가 string이거나 Firestore Timestamp일 수 있어, string 날짜 query와 Date/Timestamp query를 모두 시도한 뒤 document id 기준으로 중복 제거한다.
- `upsert`, `update`, `delete`, `promote_backlog_item_to_todo`도 전체 list 대신 가능한 경우 filtered query 후보만 읽도록 바꿨다.

## 2026-07-02 추가 검증: filtered query

- `tests/firebase-compatible-client.test.ts`에 filtered store query 사용 테스트를 추가했다.
- 기존 Timestamp date normalization 테스트가 계속 통과한다.
- `npm test`: 30개 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- `cd dashboard && npm run lint && npm run build`: 통과

## 2026-07-02 추가 점검: weekly dashboard 직접 query의 Timestamp 날짜 누락 가능성

- daily API/Supabase 호환 레이어는 string 날짜와 Firestore Timestamp 날짜를 모두 조회하도록 보강했지만, `/api/weekly-dashboard`는 별도의 직접 Firestore query를 사용하고 있었다.
- 기존 weekly dashboard query는 `where("date", ">=", "YYYY-MM-DD")` / `where("date", "<=", "YYYY-MM-DD")` string 범위만 조회했다.
- 따라서 이번주/지난주 daily 기록의 `date` 필드가 Firestore Timestamp/Date 타입으로 저장된 경우, Firebase에는 데이터가 있어도 대시보드 주간 조회에서 빠질 수 있었다.

## 2026-07-02 추가 구현: weekly dashboard string+Timestamp date query

- 루트 앱과 standalone `dashboard/` 앱의 `/api/weekly-dashboard`를 모두 수정했다.
- 최신 daily date 계산:
  - string 날짜 query: `date >= "0000-00-00"` + `orderBy("date", "desc")` + `limit(1)`
  - Timestamp 날짜 query: `date >= Date(0)` + `orderBy("date", "desc")` + `limit(1)`
  - 두 결과를 normalized date string으로 합쳐 최신 주차를 계산한다.
- 주간 daily row 조회:
  - string 범위: `startDate <= date <= endDate`
  - Timestamp 범위: `startDateT00:00:00.000Z <= date <= endDateT23:59:59.999Z`
  - document id 기준으로 중복 제거한다.
- 이 변경은 "Firebase에 있는데 대시보드에 안 나오는" 원인 중 date field type mismatch를 제거한다.

## 2026-07-02 추가 검증: weekly dashboard Timestamp date query

- `npm test`: 30개 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- `cd dashboard && npm run lint && npm run build`: 통과
