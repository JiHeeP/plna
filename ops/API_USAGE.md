# API_USAGE.md

## Evening intake (22:00)

- `POST /api/ops/evening-intake`
- 기본 동작: 파싱 결과를 `ops_backlog_items`에 저장 + `daily_todos`에 자동 반영
- 기본 todo 반영 날짜는 `next-day` (전날 저녁 로그 → 다음날 할일)
- 새벽(00:00~04:59)에 date 없이 저장하면 전날 로그로 간주해 오늘 할일로 반영
- `todoDateMode`로 강제 제어 가능 (`same-day` | `next-day`)

## Conversation save → auto intake (new)

- `POST /api/conversations` with `source_text` (or `sourceText`) and `autoOps` (default true)
- if text matches night-log pattern (`오늘 완료/미완료/보완질문`), it auto-writes backlog + daily_todos.
- `daily_journals`는 자동 기록하지 않음.

Example:

```json
{
  "date": "2026-03-07",
  "partner": "self",
  "summary": "night log",
  "source_text": "[22:00 로그]\n오늘 완료:\n- ...\n미완료:\n- ...\n22:05 보완 질문 시작\n1) ...",
  "autoOps": true
}
```

Body example:

```json
{
  "date": "2026-03-07",
  "completed": ["수업안 초안 완성"],
  "incomplete": ["학생 피드백 정리"],
  "incompleteReason": "예상보다 채점 소요 증가",
  "tomorrowTop": ["수업안 최종", "학생 피드백 2건"],
  "risks": ["오전 회의로 준비 시간 부족"],
  "deadlines": ["08:30 수업안", "15:00 피드백"]
}
```

## Chat-to-intake mode (new)

`POST /api/ops/evening-intake` also accepts raw conversation text.
If `autoFromLatestConversation: true`, it tries to pull the latest same-day row from `conversations` (`source_text` 우선, 없으면 `summary/to_improve`) and parse automatically.

```json
{
  "date": "2026-03-07",
  "chatText": "[22:00 로그]\n오늘 완료:\n- 기록 사이트 개선\n- 어휘 게임 개선안\n..."
}
```

또는 완전 자동 모드:

```json
{
  "date": "2026-03-07",
  "autoFromLatestConversation": true
}
```

It extracts:

- 오늘 완료 → `completed`
- 미완료(+보완 Q3) → `incomplete`
- 미완료 이유(+보완 Q2) → `incompleteReason`
- 보완 Q1/Q4/Q5 → `tomorrowTop`
- 보완 Q2 → `risks`
- Q1 시간표현(예: 18:00, 6시) → `deadlines`

## Backlog → Today promote (new)

- `POST /api/ops/backlog/promote`

Body:

```json
{
  "backlogId": "<ops_backlog_items.id>",
  "targetDate": "2026-03-08"
}
```

Example curl:

```bash
curl -X POST http://localhost:3030/api/ops/backlog/promote \
  -H "Content-Type: application/json" \
  -d '{"backlogId":"<uuid>","targetDate":"2026-03-08"}'
```

## Morning briefing (05:00)

- `GET /api/ops/morning-briefing?date=2026-03-08`

Returns 5 coaching lines with priority, ETA, deadline, and risk.

## Claude API (`/api/claude/*`, 2026-10-27)

Claude(예약 작업·채팅)가 쿠키 없이 일정을 읽고 추가·수정하는 길. 접근 키 게이트(`PLNA_ACCESS_KEY`) 대신 자체 토큰으로 연다.

- 인증: `Authorization: Bearer <PLNA_CLAUDE_TOKEN>` 헤더만 받음 (쿼리 `?token=`은 받지 않음)
- 토큰 미설정 → 503(닫힘) · 토큰 틀림 → 401
- **삭제 없음.** 수정은 허용한 필드만 반영 (나머지 필드는 무시)

| 경로 | GET | POST | PATCH |
|---|---|---|---|
| `/api/claude/todos` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (최대 31일, 이월 안 함) | `{ date, text, category?, sort_order? }` | `{ id, text?, completed?, date?, category?, sort_order? }` |
| `/api/claude/weekly-goals` | `?week=YYYY-Www` (기본 이번 주) | `{ week, text, pillar }` | `{ id, text?, completed? }` |
| `/api/claude/quarterly-goals` | `?quarter=YYYY-Qn` (기본 이번 분기) | — (분기 목표 추가는 사용자가 직접) | `{ id, text?, completed? }` |

- `category`: `school` | `personal` · `pillar`: `career` | `identity` | `assets` · `text`: 300자 이하

```bash
curl -s https://plna.vercel.app/api/claude/todos \
  -H "Authorization: Bearer $PLNA_CLAUDE_TOKEN" -H "Content-Type: application/json" \
  -d '{"date":"2026-10-30","text":"조합 2곳 전화","category":"personal"}'
```
