# SATUpscale — Data Layer & API Contract

> **Last updated:** 2026-09-20  
> **Status:** Live — reflects current deployed system  
> Share this file with all contributors (Lambda, frontend, extension devs).

---

## Authentication

All API routes (except OPTIONS preflight) require a **Cognito ID token** in the Authorization header.

> [!IMPORTANT]
> You must send the **`IdToken`** — NOT the `AccessToken`.  
> The API Gateway uses a `COGNITO_USER_POOLS` authorizer which only accepts ID tokens.

```
Authorization: Bearer <IdToken>
```

**`userId`** is always extracted server-side from the JWT `sub` claim — it is never sent by the client.

---

## S3

**Bucket:** `srm-upscaler-outputs`  
**Region:** `us-east-1`

### Key structure
```
srm-upscaler-outputs/
├── original/{userId}/{jobId}.{ext}   ← original uploaded image
└── output/{userId}/{jobId}.{ext}     ← upscaled output image
```

- `{userId}` — Cognito `sub` UUID from the user's JWT (set by Lambda, never by client)
- `{jobId}` — UUID generated per upscale job
- `{ext}` — matches the uploaded image format: `jpg`, `png`, or `webp`

### Access
Objects are **private**. Lambda generates **presigned GET URLs** (expires in **1 hour**) for both `originalUrl` and `outputUrl`/`processedUrl` returned in API responses. Do not store or cache presigned URLs long-term — request fresh ones via `GET /upscale/{jobId}` or `GET /history` if needed.

### Lifecycle
Objects auto-expire after **48 hours** (DynamoDB TTL + S3 lifecycle rule).

---

## DynamoDB

**Table:** `SRMJobs`  
**Region:** `us-east-1`  
**Partition key:** `jobId` (String, UUID)

### Item Schema

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `jobId` | S | ✅ | UUID, primary key |
| `userId` | S | ✅ | Cognito `sub` claim — set by Lambda from JWT |
| `status` | S | ✅ | `pending` → `processing` → `done` / `failed` |
| `timestamp` | N | ✅ | Epoch seconds — GSI sort key |
| `ttl` | N | ✅ | Epoch seconds = now + 48h — DynamoDB auto-deletes |
| `originalKey` | S | processing/done | S3 key for original image (e.g. `original/{userId}/{jobId}.png`) |
| `originalUrl` | S | processing/done | Raw S3 URL for original image — Lambda presigns on read |
| `processedUrl` | S | done only | Raw S3 URL for output image — Lambda presigns on read |
| `imageFormat` | S | done only | `JPEG`, `PNG`, or `WEBP` |
| `scaleFactor` | N | done only | Requested scale factor |
| `actualScaleFactor` | N | done only | Applied scale (may differ from requested near 2048px cap) |
| `scalingChain` | L | done only | EDSR chain e.g. `[4, 2]` = 4x→2x = 8x total |
| `inputQuality` | N | done only | 0–100 quality score |
| `qualityAssessment` | M | done only | Full blur/quality metadata map |
| `inputDimensions` | S | done only | e.g. `"256x256"` |
| `outputDimensions` | S | done only | e.g. `"2048x512"` |
| `processingTimeMs` | N | done only | End-to-end pipeline time in ms |
| `isBlurry` | BOOL | done only | Laplacian blur detection result |

### GSI: `UserHistoryIndex`

| Property | Value |
|---|---|
| Partition key | `userId` |
| Sort key | `timestamp` |
| Used by | `GET /history`, `GET /stats`, rate-limit check |

---

## API

**Base URL:** `https://0237u8c62a.execute-api.us-east-1.amazonaws.com/prod`  
**Auth:** `Authorization: Bearer <IdToken>` on all routes except OPTIONS

---

### `POST /upscale`

Upscale a base64-encoded image. Synchronous — returns when done.

**Request:**
```json
{
  "image": "<base64 string>",
  "scale_factor": 4
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | string | ✅ | Base64-encoded image. Max 10 MB. Formats: JPEG, PNG, WEBP |
| `scale_factor` | number | ❌ | `2`, `4`, `8`, `16`, or `32`. Omit to auto-calculate to 2048px cap. Also accepted as `scaleFactor` (camelCase) |

**Response `200`:**
```json
{
  "jobId": "df619acb-943a-4ded-9a1b-e62acca9b8f9",
  "status": "done",
  "originalUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/original/.../...png?Expires=...",
  "originalKey": "original/84d834c8-.../df619acb-....png",
  "outputUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/.../...png?Expires=...",
  "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/.../...png?Expires=...",
  "requestedScale": 4,
  "actualScale": 4,
  "scalingChain": [4],
  "upscaleMethod": "edsr",
  "edsr_ssim": 0.81,
  "processingTimeMs": 1240,
  "inputDimensions": "256x256",
  "outputDimensions": "1024x1024",
  "qualityAssessment": {
    "inputQualityScore": 72.4,
    "blurDetection": {
      "isBlurry": false,
      "score": 245.8
    },
    "qualityWarning": null,
    "blurWarning": null
  },
  "timingBreakdown": {
    "qualityAssessmentMs": 120.3,
    "resizeMs": 0.1,
    "inferenceMs": 850.2,
    "postProcessing1Ms": 210.5,
    "postProcessing2Ms": 1.1,
    "totalMs": 1182.2,
    "projectedInferenceMs": 1700.0
  },
  "recommendations": {}
}
```

| Field | Notes |
|---|---|
| `originalUrl` | Presigned S3 URL for the **original uploaded image** — expires in 1 hour. Ideal for Before/After view |
| `originalKey` | S3 object key for the original image in `srm-upscaler-outputs` |
| `outputUrl` / `processedUrl` | Presigned S3 URL for the **enhanced output image** — expires in 1 hour. Both keys are provided for frontend convenience |
| `upscaleMethod` | `"edsr"` (AI model used) or `"lanczos_fallback"` (EDSR hallucinated, e.g. satellite imagery) |
| `edsr_ssim` | Structural similarity score (0–1). Below `0.55` triggers Lanczos fallback |
| `actualScale` | May differ from `requestedScale` if image was close to 2048px cap |
| `scalingChain` | EDSR model operations chained, e.g. `[4, 2]` = 4x→2x = 8x |
| `qualityWarning` | Non-null string if input quality is poor — surface to user |
| `blurWarning` | Non-null string if input is detected as blurry — surface to user |

---

### `GET /upscale/{jobId}`

Get status and result of a specific job. Only the job owner can access it.

**Response `200`:**
```json
{
  "jobId": "df619acb-...",
  "status": "done",
  "timestamp": 1789884733,
  "processingTimeMs": 1240,
  "scaleFactor": 4,
  "actualScaleFactor": 4,
  "scalingChain": [4],
  "inputQuality": 72.4,
  "inputDimensions": "256x256",
  "outputDimensions": "1024x1024",
  "originalUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/original/.../...png?Expires=...",
  "originalKey": "original/.../df619acb-....png",
  "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/.../...png?Expires=...",
  "outputUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/.../...png?Expires=...",
  "qualityAssessment": { ... }
}
```

> `originalUrl` is available once processing starts. `processedUrl` and `outputUrl` are present when `status === "done"`. Fresh presigned URLs are generated on every request.

---

### `GET /history`

Returns all jobs for the authenticated user, newest first.

**Response `200`:**
```json
{
  "jobs": [
    {
      "jobId": "df619acb-...",
      "status": "done",
      "timestamp": 1789884733,
      "processingTimeMs": 1240,
      "scaleFactor": 4,
      "actualScaleFactor": 4,
      "scalingChain": [4],
      "inputQuality": 72.4,
      "inputDimensions": "256x256",
      "outputDimensions": "1024x1024",
      "originalUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/original/...?...Expires=...",
      "originalKey": "original/.../df619acb-....png",
      "processedUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/...?...Expires=...",
      "outputUrl": "https://srm-upscaler-outputs.s3.amazonaws.com/output/...?...Expires=..."
    }
  ]
}
```

> `processedUrl` / `outputUrl` is `null` for jobs that are not `"done"`. `originalUrl` is `null` only for legacy jobs created prior to original image persistence.

---

### `GET /stats`

Returns aggregate statistics for the authenticated user.

**Response `200`:**
```json
{
  "userId": "84d834c8-2031-707d-9ce1-487bcc8efeec",
  "totalImages": 12,
  "totalProcessingTimeMs": 14820,
  "averageProcessingTimeMs": 1235,
  "averageScaleFactor": 4.5,
  "averageInputQuality": 61.3
}
```

---

## Error Responses

All Lambda errors return `{ "error": "message" }`.  
API Gateway auth failures return `{ "message": "Unauthorized" }`.

| Status | Cause |
|---|---|
| `400` | Invalid base64, unsupported format, invalid `scale_factor`, image > 10MB or > 2048px |
| `401` | Missing, expired, or wrong token type (must be IdToken) |
| `403` | Job belongs to a different user |
| `404` | Job not found |
| `429` | Rate limit exceeded (20 upscales/user/hour) |
| `500` | Inference or S3/DynamoDB failure |

---

## Constraints

| Constraint | Value |
|---|---|
| Max input image | 10 MB (base64) |
| Max input dimensions | 2048 × 2048 px |
| Max output dimensions | 2048 × 2048 px |
| Supported formats | JPEG, PNG, WEBP |
| Valid `scale_factor` | `2`, `4`, `8`, `16`, `32` (or omit for auto) |
| Rate limit | 20 upscales / user / hour |
| `outputUrl` expiry | 1 hour |
| Job TTL | 48 hours |
| Lambda timeout | 60 seconds |
