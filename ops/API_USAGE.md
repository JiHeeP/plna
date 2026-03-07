# API_USAGE.md

## Evening intake (22:00)

- `POST /api/ops/evening-intake`
- 기본 동작: 할 일은 **당일(date) 즉시 생성** (`todoDateMode` 기본값 `same-day`)
- 필요시 `todoDateMode: "next-day"`로 예전 방식 유지 가능

## Conversation save → auto intake (new)

- `POST /api/conversations` with `source_text` (or `sourceText`) and `autoOps` (default true)
- if text matches night-log pattern (`오늘 완료/미완료/보완질문`), it auto-writes journal + todos.
- todo 생성일은 기본 `same-day`(즉시 반영), 필요시 `todoDateMode: "next-day"` 지정.

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

## Morning briefing (05:00)

- `GET /api/ops/morning-briefing?date=2026-03-08`

Returns 5 coaching lines with priority, ETA, deadline, and risk.
