# Lambda Route: Create Job (`POST /upscale`)

> **Note**: This function's logic is consolidated into the high-performance unified container handler at [`ml/inference/lambda_handler.py`](../../../ml/inference/lambda_handler.py#L400) under `_handle_upscale()`.

---

## Purpose
Accepts an incoming satellite image (base64-encoded) alongside an optional scaling factor (`scale_factor`: 2, 4, 8, 16, 32). Coordinates the full end-to-end enhancement lifecycle:
1. Validates Cognito `IdToken` and extracts user identifier (`sub`).
2. Checks hourly rate limit via DynamoDB `UserHistoryIndex` (max 20 jobs/hour).
3. Writes initial `pending` record to DynamoDB.
4. Uploads raw original input image to `s3://<BUCKET>/original/{userId}/{jobId}.ext`.
5. Executes EDSR neural super-resolution and quality assessment.
6. Uploads enhanced output image to `s3://<BUCKET>/output/{userId}/{jobId}.ext`.
7. Updates DynamoDB record to `done` with execution metrics and 48-hour TTL.
8. Returns 1-hour presigned URLs for both the original and enhanced images.

---

## Contract
- **Method**: `POST`
- **Route**: `/upscale`
- **Auth**: `Authorization: Bearer <IdToken>`
- **Request Body**:
  ```json
  {
    "image": "<base64_encoded_image_string>",
    "scale_factor": 4
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "jobId": "c4b1e7a2-...",
    "status": "done",
    "originalUrl": "https://s3.amazonaws.com/...",
    "outputUrl": "https://s3.amazonaws.com/...",
    "scaleFactor": 4,
    "qualityAssessment": {
      "inputQualityScore": 82.4,
      "blurDetection": { "isBlurry": false, "score": 1540.2 }
    }
  }
  ```
