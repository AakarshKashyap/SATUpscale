# Lambda Route: Get Single Job (`GET /upscale/{jobId}`)

> **Note**: This function's logic is consolidated into the unified container handler at [`ml/inference/lambda_handler.py`](../../../ml/inference/lambda_handler.py#L600) under `_handle_get_job()`.

---

## Purpose
Retrieves the real-time status, execution metrics, and fresh presigned download URLs for an individual enhancement job. Used by the web application for polling in-flight jobs and reloading historic before/after comparisons.

---

## Contract
- **Method**: `GET`
- **Route**: `/upscale/{jobId}`
- **Auth**: `Authorization: Bearer <IdToken>`
- **Response (200 OK)**:
  ```json
  {
    "jobId": "c4b1e7a2-...",
    "status": "done",
    "originalUrl": "https://s3.amazonaws.com/srm-upscaler-outputs/original/...",
    "outputUrl": "https://s3.amazonaws.com/srm-upscaler-outputs/output/...",
    "scaleFactor": 8,
    "qualityAssessment": {
      "inputQualityScore": 76.5,
      "blurDetection": { "isBlurry": false, "score": 2400.1 }
    },
    "createdAt": 1726842000,
    "processingTimeMs": 2840
  }
  ```
- **Access Control**:
  - Enforces ownership verification: If `item['userId'] != current_user_id`, the handler returns `403 Forbidden`.
  - Generates newly signed 1-hour presigned GET URLs for both `originalUrl` and `outputUrl`.
