# Firebase Firestore 설정 가이드

PLNA의 데이터 저장소는 Firebase Firestore입니다. (예전 Supabase 데이터는 2026-07에 Firestore로 이전을 마쳤고, Supabase 관련 코드는 제거했습니다.)

## 1. Firebase 준비

1. Firebase 프로젝트를 만들고 Firestore Database를 Native mode로 켭니다.
2. Firebase 콘솔에서 웹 앱을 추가한 뒤 `NEXT_PUBLIC_FIREBASE_*` 값을 `.env.local`에 넣습니다.
3. 서버 API Route용 서비스 계정 키를 준비합니다.

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

## 2. 컬렉션

주요 컬렉션: `affirmations`, `daily_habits`, `habit_logs`, `conversations`, `conversation_topics`, `numeric_targets`, `numeric_logs`, `kakao_tokens`, `notification_settings`, `ops_backlog_items`, `daily_todos`, `daily_journals`, `monthly_goals`, `weekly_goals`, `weekly_reflections`, `quarterly_goals`, `sub_goals`.

API Route는 `lib/firebase/supabase-compatible.ts`의 쿼리 빌더(`from().select().eq()...` 형태)로 Firestore에 접근합니다. 이름에 Supabase가 남아 있지만 내부는 Firestore입니다.

### 대시보드와 분리된 오늘의 일기

`daily_diaries`는 오늘 화면의 "오늘의 일기" 단일 입력칸 전용 컬렉션입니다. 주간 대시보드, 인사이트, 로컬 daily 백업 sync는 이 컬렉션을 읽지 않습니다. 대시보드에 노출되는 일일 요약은 기존 `daily_journals`, `daily_todos`, `habit_logs`만 사용합니다.

## 3. 보안 규칙 주의

Firestore는 production rules 상태를 유지합니다. 브라우저 화면은 Firestore SDK로 직접 읽고 쓰지 않고 `/api/*` Route를 호출하며, 서버 API Route가 Firebase Admin SDK로 Firestore에 접근합니다.

운영/Preview 배포 환경에는 다음 서버 환경변수가 필요합니다.

```env
FIREBASE_SERVICE_ACCOUNT_JSON=
```

이 값은 서비스 계정 JSON 전체 문자열 또는 base64 문자열입니다. 저장소에 커밋하지 말고 Vercel 환경변수 또는 로컬 `.env.local`에만 보관합니다.

Firebase Auth 기반 사용자별 규칙은 추후 다중 사용자 권한이 필요해질 때 추가합니다.

## 참고 문서

- Firebase: Firestore batched writes - https://firebase.google.com/docs/firestore/manage-data/transactions

## 4. 주간 자동 백업 (2026-11-17)

`.github/workflows/firestore-backup.yml`이 매주 일요일 03:00(KST)에 Firestore 전체를 읽어 **암호화된 파일**로 남깁니다. Firestore에는 아무것도 쓰지 않습니다.

1. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: Vercel에 넣은 것과 같은 서비스 계정 값
   - `PLNA_BACKUP_PASSPHRASE`: 백업을 잠글 비밀번호(길게, 따로 안전하게 보관. 잃어버리면 백업을 못 엶)
2. Actions 탭 → Firestore backup → Run workflow 로 한 번 수동 실행해 확인
3. 백업 파일은 실행 화면 아래 Artifacts에 90일간 보관됩니다.

복호화(내 컴퓨터에서):

```bash
PLNA_BACKUP_PASSPHRASE='비밀번호' node scripts/backup-firestore.mjs --decrypt=plna-2026-11-17.json.enc --out=plna-2026-11-17.json
```

저장소가 공개라서 암호화 없이는 백업하지 않습니다(`--require-encryption`). 로그에는 컬렉션 이름과 문서 수만 찍힙니다.
