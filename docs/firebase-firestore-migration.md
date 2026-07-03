# Firebase Firestore 이전 가이드

Supabase에 있던 기존 데이터를 같은 이름의 Firestore 컬렉션으로 옮기는 절차입니다.

## 1. Firebase 준비

1. Firebase 프로젝트를 만들고 Firestore Database를 Native mode로 켭니다.
2. Firebase 콘솔에서 웹 앱을 추가한 뒤 `NEXT_PUBLIC_FIREBASE_*` 값을 `.env.local`에 넣습니다.
3. 서버/이전 스크립트용 서비스 계정 키를 준비합니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

`FIREBASE_SERVICE_ACCOUNT_JSON`은 서비스 계정 JSON 전체 문자열 또는 base64 문자열을 넣을 수 있습니다.

## 2. Supabase 읽기 전용 준비

이전 스크립트는 Supabase REST API로 데이터를 읽습니다. 서비스 역할 키는 로컬 이전 작업에만 쓰고 브라우저에 노출하지 않습니다.

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_ANON_KEY`도 동작하지만, RLS 정책 때문에 모든 행을 읽지 못할 수 있습니다. 실제 이전은 `SUPABASE_SERVICE_ROLE_KEY`를 권장합니다.

## 3. 사전 확인

쓰기 없이 Supabase에서 읽을 수 있는 행 수만 확인합니다.

```bash
npm run migrate:supabase-to-firestore -- --dry-run
```

일부 컬렉션만 확인할 때:

```bash
npm run migrate:supabase-to-firestore -- --dry-run --only=daily_todos,weekly_goals
```

## 4. 실제 이전

```bash
npm run migrate:supabase-to-firestore
```

스크립트 동작:

- Supabase 테이블 이름과 같은 Firestore 컬렉션에 저장합니다.
- Supabase의 `id` 값을 Firestore 문서 ID로 사용합니다.
- Firestore에는 `set(..., { merge: true })` 방식으로 씁니다.
- Supabase에서 삭제된 행을 Firestore에서 자동 삭제하지는 않습니다.
- 기본 이전 대상은 `affirmations`, `daily_habits`, `habit_logs`, `conversations`, `conversation_topics`, `milestones`, `numeric_targets`, `numeric_logs`, `kakao_tokens`, `notification_settings`, `ops_backlog_items`, `daily_todos`, `daily_journals`, `monthly_goals`, `weekly_goals`, `weekly_reflections`, `quarterly_goals`, `sub_goals`입니다.

### 대시보드와 분리된 오늘의 일기

`daily_diaries`는 오늘 화면의 "오늘의 일기" 전용 컬렉션입니다. 화면 입력은 기존 3칸 저널 형태(`went_well`, `to_improve`, `accomplishments`)를 유지하지만, 주간 대시보드, 인사이트, 로컬 daily 백업 sync는 이 컬렉션을 읽지 않습니다. 대시보드에 노출되는 일일 요약은 기존 `daily_journals`, `daily_todos`, `habit_logs`만 사용합니다.

## 5. 이전 후 점검

1. Firestore 콘솔에서 컬렉션별 문서 수를 확인합니다.
2. 메인 앱과 대시보드에서 오늘 할 일, 습관, 주간 목표, 회고, 목표 페이지를 열어봅니다.
3. 문제가 없으면 Supabase 서비스 역할 키를 폐기하거나 권한을 회수합니다.

## 6. 보안 규칙 주의

Firestore는 production rules 상태를 유지합니다. 브라우저 화면은 Firestore SDK로 직접 읽고 쓰지 않고 `/api/*` Route를 호출하며, 서버 API Route가 Firebase Admin SDK로 Firestore에 접근합니다.

운영/Preview 배포 환경에는 다음 서버 환경변수가 필요합니다.

```env
FIREBASE_SERVICE_ACCOUNT_JSON=
```

이 값은 서비스 계정 JSON 전체 문자열 또는 base64 문자열입니다. 저장소에 커밋하지 말고 Vercel 환경변수 또는 로컬 `.env.local`에만 보관합니다.

Firebase Auth 기반 사용자별 규칙은 추후 다중 사용자 권한이 필요해질 때 추가합니다.

## 참고 문서

- Firebase: Firestore batched writes - https://firebase.google.com/docs/firestore/manage-data/transactions
- Supabase: REST API / selecting data - https://supabase.com/docs/reference/javascript/select
