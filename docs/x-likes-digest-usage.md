# X Likes Digest Usage

## Endpoint

- `GET /api/x-likes-digest`
- Optional: `GET /api/x-likes-digest?limit=30`

## Required env

- `X_USER_ID`
- One of:
  - `X_BEARER_TOKEN` (preferred)
  - `X_ACCESS_TOKEN`

## Optional env

- `KIMI_API_KEY` (+ base/model) for AI summary
  - if missing or fails, rule-based summary is returned

## Response shape

```json
{
  "ok": true,
  "count": 12,
  "summary": "...",
  "bullets": ["..."],
  "source": "ai | rule",
  "fetchedAt": "2026-03-07T...Z"
}
```

## Notes

- This API currently focuses on on-demand digest generation.
- Scheduled 07:00 delivery can call this endpoint and route the output to Discord DM.
