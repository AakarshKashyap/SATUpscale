# Lambda Route: Generate Upload URL (Direct S3 Presigned Ingestion)

> **Note**: For standard workflows, clients submit directly via `POST /upscale` (base64 JSON). This route outlines the architecture for direct-to-S3 multi-part uploads for oversized satellite rasters (>6 MB API Gateway payload limit).

---

## Purpose
Enables frontend clients to bypass the AWS API Gateway 6 MB payload ceiling by requesting a temporary presigned S3 `PutObject` URL.

---

## Operational Flow
1. Client calls `POST /upload-url` with `{ "filename": "scene.tif", "contentType": "image/tiff" }`.
2. Lambda generates an S3 presigned upload URL:
   - Key: `original/{userId}/{jobId}.tif`
   - Expiration: 15 minutes.
3. Client issues an HTTP `PUT` directly to Amazon S3 with the raw binary raster.
4. S3 triggers an event notification or client calls `POST /upscale` with `{ "jobId": "..." }` to initiate processing.
