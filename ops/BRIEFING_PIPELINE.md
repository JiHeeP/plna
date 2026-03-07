# BRIEFING_PIPELINE.md

## 목적
- 전날 로그 + plna 데이터를 기반으로 다음날 실행 브리핑 자동 생성
- 아침 준비 시간을 5분 이내로 축소

## 스케줄
- 22:00: Evening Log Intake (main 봇)
- 05:00: Morning Ops Briefing
- 07:00: Market Briefing (real-estate 스킬 기반, 부동산/코인 분리)
- 15:00: Afternoon Check-in Briefing

## 데이터 우선순위
1. 전날 22:00 고정 폼 로그
2. plna 데이터 (todos/habits/goals/journal)
3. 최근 대화 컨텍스트(로그 누락 시 보조)

## 출력 정책
- 톤: 코치형
- 길이: 5줄 상세
- 필수 필드: 우선순위 / 예상시간 / 마감 / 리스크

## 분류 경계(요약)
- 🟢 Dispatch: 자동 정리/요약/브리핑 생성
- 🟡 Prep: 초안 생성 후 사용자 확정
- 🔴 Yours: 학생정보/전략/최종 발신 판단
- ⚪ Skip: 오늘 목표 비관련/근거 부족

## 실행 단계
1) Evening Intake 수집
2) 구조화 저장(plna)
3) Morning Prioritization (Top 3)
4) Risk Annotation
5) Briefing Emit

## 실패 처리
- 로그 누락: plna + 최근 대화로 대체 브리핑 생성, 누락 표시
- 데이터 충돌: 사용자 로그 우선
- 근거 부족: Skip로 분류 + 사유 표시
