# SRM Upscaler — Data Layer Contract (S3 + DynamoDB)

Owner: [your name] — S3 + DynamoDB
Share this file with the Lambda dev and the website/extension dev.

## S3

**Bucket:** `srm-upscaler-outputs`
**Structure:**
```
srm-upscaler-outputs/
├── input/{jobId}.png      (optional, if storing originals)
└── output/{jobId}.png     (upscaled result — publicly readable)
```
**Public URL format:**
```
https://srm-upscaler-outputs.s3.amazonaws.com/output/{jobId}.png
```
- Only `output/*` is public. `input/*` is private unless you decide otherwise.
- Objects auto-expire after 2 days (lifecycle rule).

## DynamoDB

**Table:** `SRMJobs`
**Partition key:** `jobId` (String, UUID)

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `jobId` | S | yes | UUID, primary key |
| `userId` | S | yes | UUID generated client-side by extension, stored in `chrome.storage.local` |
| `originalUrl` | S | yes | source image URL |
| `processedUrl` | S | yes | S3 output URL |
| `status` | S | yes | `pending` \| `processing` \| `done` \| `failed` |
| `timestamp` | N | yes | epoch seconds, used as GSI sort key |
| `inputSize` | S | no | e.g. `"256x256"` |
| `processingTimeMs` | N | no | for QA's performance metrics |
| `ttl` | N | yes | epoch seconds = now + 48h, for auto-cleanup |

**GSI: `UserHistoryIndex`**
- Partition key: `userId`
- Sort key: `timestamp`
- Used by the website's `/history` endpoint to list a user's past jobs, newest first.

## API contracts (for Lambda dev to implement)

### POST /upscale (extension → Lambda)
Request:
```json
{ "userId": "uuid", "imageUrl": "https://..." }
```
Response:
```json
{ "jobId": "uuid", "outputUrl": "https://...", "status": "done" }
```

### GET /history?userId=uuid (website → Lambda)
Response:
```json
{
  "jobs": [
    {
      "jobId": "uuid",
      "originalUrl": "https://...",
      "processedUrl": "https://...",
      "timestamp": 1732000000,
      "status": "done"
    }
  ]
}
```
Implementation note: Query `UserHistoryIndex` with `KeyConditionExpression: userId = :uid`, `ScanIndexForward: false` (newest first).

## userId generation (client-side, no auth needed for MVP)
Extension generates a UUID on install:
```js
let userId = localStorage.getItem('srm_user_id');
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem('srm_user_id', userId);
}
```
Website reads it via URL param: `yoursite.com/history?uid={userId}` (extension's "View History" button opens this link).
