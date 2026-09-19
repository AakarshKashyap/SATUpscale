"""
satup-setup - AWS Lambda Handler
Routes:
  POST /upscale  -- upscale a base64-encoded image, save to S3, log to DynamoDB
  GET  /history  -- return a user's upscale history (newest first)
  OPTIONS        -- CORS preflight passthrough

Environment variables (set in Lambda console or IaC):
  S3_BUCKET    default: srm-upscaler-outputs
  DYNAMO_TABLE default: SRMJobs
  AWS_REGION   default: us-east-1 (usually auto-set by Lambda runtime)
"""

import io
import os
import json
import base64
import uuid
import time
import logging

import boto3
from boto3.dynamodb.conditions import Key
# pyrefly: ignore [missing-import]
from PIL import Image



from upscale import upscale_image

# ================================================================================
# Logging - structured JSON so CloudWatch Insights can query fields
# ================================================================================
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ================================================================================
# AWS clients - initialized once at cold start, reused on warm invocations
# ================================================================================
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_BUCKET = os.environ.get("S3_BUCKET",   "srm-upscaler-outputs")
_TABLE  = os.environ.get("DYNAMO_TABLE", "SRMJobs")

_s3     = boto3.client("s3", region_name=_REGION)
_dynamo = boto3.resource("dynamodb", region_name=_REGION)
_table  = _dynamo.Table(_TABLE)

# Accepted PIL format strings for uploaded images
_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Output format mappings: PIL format string -> extension / MIME / quality
_FORMAT_EXT     = {"JPEG": "jpg",         "PNG": "png",       "WEBP": "webp"}
_FORMAT_MIME    = {"JPEG": "image/jpeg",  "PNG": "image/png", "WEBP": "image/webp"}
_FORMAT_QUALITY = {"JPEG": 90, "PNG": None, "WEBP": 90}  # None = lossless (PNG)


# ================================================================================
# Lambda entry point
# ================================================================================

def handler(event, context):
    """
    Main Lambda entry point. Supports both:
    - REST API Gateway (v1): event['httpMethod'] + event['path']
    - HTTP API Gateway (v2): event['requestContext']['http']['method'] + event['rawPath']
    """
    logger.info(f"FULL_EVENT: {json.dumps(event)}")
    path = (event.get("path") or event.get("rawPath") or "").rstrip("/")
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()

    logger.info(json.dumps({
        "route":     f"{method} {path}",
        "requestId": context.aws_request_id,
    }))

    try:
        if method == "POST" and path.endswith("/upscale"):
            return _handle_upscale(event, context)
        elif method == "GET" and path.endswith("/history"):
            return _handle_history(event, context)
        elif method == "OPTIONS":
            return _response(200, {})   # CORS preflight
        else:
            return _response(404, {"error": f"Route not found: {method} {path}"})

    except Exception as exc:
        logger.exception("Unhandled top-level error")
        return _response(500, {"error": "Internal server error", "detail": str(exc)})


# ================================================================================
# POST /upscale
# ================================================================================

def _handle_upscale(event, context):
    t_start = time.time()

    # -- Parse request body -------------------------------------------------------
    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, {"error": "Request body must be valid JSON."})

    # Extract user ID (from Cognito JWT in API Gateway if present, else fallback to JSON body)
    auth_claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {}) or event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = auth_claims.get("sub") or (body.get("userId") or "").strip()
    image_b64 = (body.get("image")  or "").strip()

    if not user_id:
        return _response(400, {"error": "Missing required field: userId"})
    if not image_b64:
        return _response(400, {"error": "Missing required field: image (base64 string)"})

    # -- Create job record (status = pending) ------------------------------------
    job_id = str(uuid.uuid4())
    now_ts = int(time.time())
    ttl_ts = now_ts + 48 * 3600   # auto-expire in 48 hours (DynamoDB TTL)

    _table.put_item(Item={
        "jobId":     job_id,
        "userId":    user_id,
        "status":    "pending",
        "timestamp": now_ts,
        "ttl":       ttl_ts,
    })

    logger.info(json.dumps({"jobId": job_id, "userId": user_id, "status": "pending"}))

    # -- Decode image -------------------------------------------------------------
    try:
        image_bytes = base64.b64decode(image_b64)
        pil_image   = Image.open(io.BytesIO(image_bytes))

        # Validate format (JPEG, PNG, WebP only)
        img_format = pil_image.format  # set by PIL from file headers
        if img_format not in _ALLOWED_FORMATS:
            _mark_failed(job_id)
            return _response(400, {
                "error": f"Unsupported image format: {img_format}. "
                         "Accepted formats: JPEG, PNG, WEBP."
            })

        pil_image = pil_image.convert("RGB")

    except Exception as exc:
        _mark_failed(job_id)
        return _response(400, {"error": f"Could not decode image: {exc}"})

    # -- Update status to processing ---------------------------------------------
    _update_status(job_id, "processing")

    # -- Run ML inference --------------------------------------------------------
    try:
        result_image, img_meta = upscale_image(pil_image)
    except ValueError as exc:
        # Size validation error - client's fault (400)
        _mark_failed(job_id)
        return _response(400, {"error": str(exc)})
    except Exception as exc:
        logger.exception("Inference failed for jobId=%s", job_id)
        _mark_failed(job_id)
        return _response(500, {"error": f"Inference failed: {exc}"})

    processing_ms = int((time.time() - t_start) * 1000)

    # -- Save output PNG to S3 ---------------------------------------------------
    try:
        buf     = io.BytesIO()
        quality = _FORMAT_QUALITY[img_format]
        if quality:
            result_image.save(buf, format=img_format, quality=quality)
        else:
            result_image.save(buf, format=img_format)  # PNG: lossless
        buf.seek(0)

        ext    = _FORMAT_EXT[img_format]
        s3_key = f"output/{user_id}/{job_id}.{ext}"   # Partitioned by userId (per ML tasks checklist)
        _s3.put_object(
            Bucket=_BUCKET,
            Key=s3_key,
            Body=buf.getvalue(),
            ContentType=_FORMAT_MIME[img_format],
        )
        processed_url = f"https://{_BUCKET}.s3.amazonaws.com/{s3_key}"

    except Exception as exc:
        logger.exception("S3 upload failed for jobId=%s", job_id)
        _mark_failed(job_id)
        return _response(500, {"error": f"S3 upload failed: {exc}"})

    # -- Update DynamoDB to done -------------------------------------------------
    try:
        _table.update_item(
            Key={"jobId": job_id},
            UpdateExpression=(
                "SET #st = :s, processedUrl = :u, "
                "inputSize = :i, processingTimeMs = :t, imageFormat = :f"
            ),
            ExpressionAttributeNames={"#st": "status"},   # 'status' is a reserved word
            ExpressionAttributeValues={
                ":s": "done",
                ":u": processed_url,
                ":i": img_meta["inputSize"],
                ":t": processing_ms,
                ":f": img_format,
            },
        )
    except Exception as exc:
        # Non-fatal: job succeeded, just the log entry failed
        logger.error("DynamoDB final update failed for jobId=%s: %s", job_id, exc)

    logger.info(json.dumps({
        "jobId":            job_id,
        "userId":           user_id,
        "status":           "done",
        "processingTimeMs": processing_ms,
        "outputUrl":        processed_url,
        **img_meta,
    }))

    # Response matches SCHEMA.md exactly
    return _response(200, {
        "jobId":     job_id,
        "outputUrl": _presign(processed_url),
        "status":    "done",
    })


# ================================================================================
# GET /history?userId=...
# ================================================================================

def _handle_history(event, context):
    params  = event.get("queryStringParameters") or {}
    
    # For Function URLs, parse rawQueryString
    if not params and event.get("rawQueryString"):
        qs = event.get("rawQueryString", "")
        for pair in qs.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                params[k] = v
    
    # Extract user ID (from Cognito JWT in API Gateway if present, else fallback to query param)
    auth_claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {}) or event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = auth_claims.get("sub") or (params.get("userId") or "").strip()

    if not user_id:
        return _response(400, {"error": "Missing required query param: userId"})

    try:
        result = _table.query(
            IndexName="UserHistoryIndex",
            KeyConditionExpression=Key("userId").eq(user_id),
            ScanIndexForward=False,   # newest first (descending timestamp)
        )
    except Exception as exc:
        logger.exception("DynamoDB history query failed for userId=%s", user_id)
        return _response(500, {"error": "Failed to fetch history."})

    # Response matches SCHEMA.md exactly
    jobs = [
        {
            "jobId":        item.get("jobId"),
            "originalUrl":  item.get("originalUrl"),    # None for base64 uploads (MVP)
            "processedUrl": _presign(item.get("processedUrl")),
            "timestamp":    item.get("timestamp"),
            "status":       item.get("status"),
        }
        for item in result.get("Items", [])
    ]

    return _response(200, {"jobs": jobs})


# ================================================================================
# Helpers
# ================================================================================

def _mark_failed(job_id: str):
    """Best-effort status update to 'failed'. Swallows exceptions."""
    try:
        _update_status(job_id, "failed")
    except Exception:
        pass


def _update_status(job_id: str, status: str):
    _table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET #st = :s",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": status},
    )


from decimal import Decimal


def _json_default(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    raise TypeError(f"Not JSON serializable: {type(o)}")


def _presign(url):
    """Turn a stored S3 URL into a temporary signed GET URL."""
    prefix = f"https://{_BUCKET}.s3.amazonaws.com/"
    if not url or not url.startswith(prefix):
        return url
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": _BUCKET, "Key": url[len(prefix):]},
        ExpiresIn=3600,
    )


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type":                 "application/json",
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body, default=_json_default),
    }
