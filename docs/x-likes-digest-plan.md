# X Likes Digest Plan (07:00 + On-demand)

## Goal
- Collect only posts liked by the user on X
- Send daily summary at 07:00 (Asia/Seoul)
- Also support on-demand summary when requested

## Product Fit
- Repository: `plna` (main/personal planning domain)
- Operating agent: `real-estate` (market-intel/investment flow)

## Scope (MVP)
1. Fetch likes for last 24h (or since checkpoint)
2. Deduplicate and normalize items
3. Summarize in Korean bullets:
   - 핵심 주제
   - 중요한 링크
   - 오늘의 인사이트 3~5개
4. Deliver to Discord DM

## Architecture
1. **Fetcher**
   - Input: X account auth
   - Output: liked posts list
2. **Checkpoint Store**
   - Save last processed like id/timestamp
3. **Summarizer**
   - Convert liked posts -> concise digest
4. **Delivery**
   - Scheduled run: 07:00 KST
   - On-demand run: command trigger

## API/Config Requirements
- X access method to be confirmed:
  - Preferred: official X API + proper scopes
- Env candidates:
  - `X_API_KEY`, `X_API_SECRET`
  - `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
  - `X_USER_ID`
  - `DIGEST_TIMEZONE=Asia/Seoul`

## Open Questions
1. Official X API plan/scopes available?
2. Summary length preference:
   - short (5 bullets)
   - medium (10 bullets)
3. Delivery target fixed to Discord DM?

## Next Implementation Steps
1. Create service: `lib/x-likes.ts`
2. Create endpoint: `app/api/x-likes-digest/route.ts`
3. Add scheduler hook (07:00 KST)
4. Add manual trigger command path
5. Add docs for setup and ops
