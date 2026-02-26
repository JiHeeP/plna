# Security Publish Checklist

GitHub에 코드 푸시/PR 생성 전 아래를 확인하세요.

## 1) 키 저장 위치
- 키는 `.env.local` 같은 로컬 환경 파일에만 저장
- 코드/문서/스크린샷/이슈 코멘트에 키를 직접 적지 않기

## 2) 사전 검사
- `npm run check:secrets` 실행
- `npm run lint` 실행

## 3) 자동 검사
- PR/`main` push 시 GitHub Actions가 `check:secrets`와 `lint`를 실행
- 실패 시 머지 전에 반드시 수정

## 4) 사고 대응
- 키가 노출된 흔적이 있으면 즉시 폐기(rotate)
- 새 키 발급 후 환경변수 업데이트
