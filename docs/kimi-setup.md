# Kimi 2.5 연동 설정

`/api/insights`는 기본적으로 OpenAI를 사용하지만, 환경변수로 Kimi로 전환할 수 있습니다.

## 1) 환경변수 설정 (`.env.local`)

```bash
LLM_PROVIDER=kimi
KIMI_API_KEY=YOUR_KIMI_KEY
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=kimi-k2-0711-preview
```

> 참고: 사용 가능한 정확한 Kimi 2.5 모델명은 계정/리전/플랜에 따라 다를 수 있으니, 본인 콘솔의 모델 목록 기준으로 `KIMI_MODEL` 값을 넣어주세요.

## 2) 동작 방식
- `LLM_PROVIDER=kimi`면 Kimi 설정을 사용합니다.
- 그 외에는 OpenAI 설정(`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`)을 사용합니다.
- API 호출 실패 시에도 폴백 인사이트를 반환합니다.

## 3) 보안
- API 키는 절대 코드/커밋/채팅에 남기지 마세요.
- 이미 키를 외부에 공유했다면 즉시 재발급(rotate)하세요.
