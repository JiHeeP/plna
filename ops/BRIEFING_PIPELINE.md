# BRIEFING_PIPELINE.md

## 목적
- 전날 로그 + plna 데이터를 기반으로 다음날 실행 브리핑 자동 생성
- 아침 준비 시간을 5분 이내로 축소

## 스케줄
- 22:00: plna 기준 Evening Log 기록
- 22:05: Clarifying Questions(부족 정보 질의)
- 05:00: Morning Ops Briefing
- 07:00: Market Briefing (real-estate 스킬 기반, 부동산/코인 분리)
- 15:00: Afternoon Check-in Briefing

## 데이터 우선순위
1. plna 데이터 (todos/habits/goals/journal)  ← 단일 원본
2. 22:00~22:30 보완 질의 응답
3. 최근 대화 컨텍스트(누락 시 보조)

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
1) 22:00 plna 로그 확인/저장
2) 누락 항목 자동 탐지
3) 최대 5개 보완 질문 발송 (22:05)
4) 답변 반영 후 Top3 + Risk 생성
5) 05:00 브리핑 발행

## 실패 처리
- 로그 누락: 질문 1회 발송 후, 미응답이면 plna 기존 데이터로 최소 브리핑 생성
- 데이터 충돌: plna 최신 기록 우선, 모호 시 사용자 확인
- 근거 부족: Skip로 분류 + 사유 표시
