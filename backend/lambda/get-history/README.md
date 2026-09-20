# Lambda Route: Get User History (`GET /history`)

> **Note**: This function's logic is consolidated into the unified container handler at [`ml/inference/lambda_handler.py`](../../../ml/inference/lambda_handler.py#L650) under `_handle_history()`.

---

## Purpose
Retrieves historical enhancement jobs submitted by the currently authenticated user. Ensures strict multi-tenant isolation by querying DynamoDB's `UserHistoryIndex` using the caller's JWT `sub` claim.

---

## Contract
- **Method**: `GET`
- **Route**: `/history`
- **Auth**: `Authorization: Bearer <IdToken>`
- **Response (200 OK)**:
  ```json
  {
    "jobs": [
      {
        "jobId": "c4b1e7a2-...",
        "status": "done",
        "originalUrl": "https://s3.amazonaws.com/srm-upscaler-outputs/original/...",
        "outputUrl": "https://s3.amazonaws.com/srm-upscaler-outputs/output/...",
        "scaleFactor": 4,
        "createdAt": 1726842000,
        "processingTimeMs": 1420
      }
    ]
  }
  ```
- **Security**:
  - Automatically regenerates fresh 1-hour presigned S3 URLs on each request.
  - Queries `SRMJobs` via `UserHistoryIndex` partitioned strictly by `userId`. Users can never query or view other tenants' jobs.
