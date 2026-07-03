# 분석 기록: 오늘의 일기 분리 및 습관 항목 정리

- **일시**: 2026-07-03
- **요구사항 원문**: "0. 오늘의 기록 부분에 오늘의 일기 를 남기도록 해주고, 이건 대시보드 연결 안되게 해달라 / 1. 이번주 월요일부터 습관 체크에 연구대회 2시간을 삭제해달라 / 2. 대신 문해력 증진 방법 연구로 바꿔달라 / 3. 습관 체크에서 대화 기록도 삭제해달라"
- **판정**: ⚠️ 조건부 안전

## 영향 범위

| 대상 | 영향 수준 | 상세 |
|---|---|---|
| `components/dashboard/daily-journal.tsx` | 높음 | 오늘 화면의 3칸 기록 입력 UI는 유지하고 저장 API만 바꾼다. |
| `app/api/diary/route.ts` | 신규 | 대시보드가 읽지 않는 별도 일기 API를 만든다. |
| `lib/firebase/daily-record-writes.ts` | 중간 | `daily_diaries` 직접 쓰기 helper를 추가한다. 기존 `daily_journals`는 유지한다. |
| `lib/types.ts` | 낮음 | `DailyDiary` 타입을 추가한다. |
| `lib/constants.ts` | 낮음 | 로컬 fallback 기본 습관에서 연구대회/대화 기록 항목을 정리한다. |
| Firestore `daily_habits` / `habit_logs` | 높음 | 실제 습관 목록과 2026-06-29 이후 로그를 수정/삭제한다. |
| 주간 대시보드 | 낮음 | 새 `daily_diaries`는 읽지 않는다. 습관 개수는 활성 습관 기준으로 바뀐다. |

## 점검 결과

| 점검 항목 | 결과 | 근거 |
|---|---|---|
| 인증/권한 제약 | ✅ | `.env.local` 기반 Firebase Admin read/write가 현재 성공한다. |
| 데이터 제약 | ⚠️ | 습관은 `effective_from` 구조가 없어, 과거 의미를 지키려면 기존 습관 비활성화 + 새 습관 추가 + 2026-06-29 이후 해당 로그 삭제가 가장 안전하다. |
| 운영 제약 | ✅ | cron/스케줄 작업이 아니다. 배포 전후 API/빌드 검증 가능하다. |
| 보안 제약 | ✅ | 새 일기 본문은 API로 저장하지만 로그/테스트 출력에 본문을 노출하지 않는다. 비밀키 파일은 수정하지 않는다. |
| 검증 제약 | ✅ | 로컬 `npm test`, `npm run lint`, `npm run build`와 production API read/write probe로 검증 가능하다. |
| 기존 약속 | ✅ | 기존 `/api/journal`와 `daily_journals`는 삭제하지 않아 과거 대시보드 데이터와 인사이트를 유지한다. |
| 연결 관계 | ✅ | 화면은 새 API를 호출하고, API는 Firebase helper만 호출한다. 대시보드는 새 컬렉션을 참조하지 않는다. |
| 데이터 모양 | ✅ | 기존 컬렉션 스키마를 바꾸지 않고 `daily_diaries`를 새로 추가한다. |
| 과거 기록 | ⚠️ | `daily_habits`의 활성 목록은 전역이라 대시보드의 과거 주차 습관 총수 해석이 바뀔 수 있다. 기존 습관 문서는 비활성화만 하고 로그 삭제는 2026-06-29 이후로 제한한다. |
| 사용자 흐름 | ✅ | 오늘 화면에서 3칸 일기 저장은 유지되며, localStorage 키를 `diary_YYYY-MM-DD`로 분리해 로컬 백업 sync가 `daily_journals`로 밀어 넣지 않는다. |
| 되돌리기 어려움 | ⚠️ | 실제 Firestore 로그 삭제가 포함된다. 삭제 전 대상 id/date를 확인하고, 사용자 요구 범위인 2026-06-29 이후 `연구대회 2시간`, `대화 기록` 로그만 삭제한다. |

## 기술 요구사항

| 순서 | 작업 유형 | 대상 | 설명 | 의존 순서 |
|---|---|---|---|---|
| 1 | NEW_SERVICE | `lib/firebase/daily-record-writes.ts` | `daily_diaries_YYYY-MM-DD` 문서 id와 `writeDailyDiary` 추가 | - |
| 2 | NEW_SERVICE | `app/api/diary/route.ts` | 날짜별 일기 조회/저장 API 추가. `daily_journals` 미사용 | 1 |
| 3 | NEW_COMPONENT | `components/dashboard/daily-journal.tsx` | 오늘의 기록 UI를 3칸 저널 그대로 유지하고 `/api/diary`, `diary_` localStorage 키 사용 | 2 |
| 4 | DATA_EDIT | `lib/constants.ts` | fallback 기본 습관에서 `research`를 새 이름으로 바꾸고 `conversation_log` 제거 | - |
| 5 | DATA_EDIT | Firestore | `연구대회 2시간`, `대화 기록` 비활성화, `문해력 증진 방법 연구` 활성 습관 추가, 2026-06-29 이후 두 기존 습관 로그 삭제 | 4 |
| 6 | BUG_FIX/TEST | `tests/daily-record-writes.test.ts` | 새 일기 helper가 read 없이 `daily_diaries`에 쓰는지 검증 | 1 |
| 7 | DOC_CHANGE | `docs/firebase-firestore-migration.md` | `daily_diaries`가 대시보드 제외 저장소임을 기록 | 2 |

## 제시한 대안

- 기존 `daily_journals`에 `dashboard_visible: false`를 추가하는 방식은 대시보드/인사이트/백업 sync 전반을 같이 바꿔야 해서 위험하다.
- 별도 `daily_diaries` 컬렉션과 `diary_` localStorage 키를 쓰는 방식이 가장 작고 되돌리기 쉽다.
