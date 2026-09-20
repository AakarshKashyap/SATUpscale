"""
satup-setup - AWS Lambda Handler with JWT Validation & Dynamic Scaling
Routes:
  POST /upscale  -- upscale a base64-encoded image to 2048px cap, save to S3, log to DynamoDB
  GET  /upscale/{jobId}  -- check status of a specific job
  GET  /history  -- return a user's upscale history (newest first)
  GET  /stats    -- return user's upscaling statistics
  OPTIONS        -- CORS preflight passthrough

Environment variables (set in Lambda console or IaC):
  S3_BUCKET    default: srm-upscaler-outputs
  DYNAMO_TABLE default: SRMJobs
  AWS_REGION   default: us-east-1
"""

import io
import os
import json
import base64
import uuid
import time
import logging
from typing import Dict, Tuple, Optional
from functools import lru_cache
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import requests
# pyrefly: ignore [missing-import]
from PIL import Image

from upscale import upscale_image

# ================================================================================
# Logging - structured JSON so CloudWatch Insights can query fields
# ================================================================================
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ================================================================================
# Cognito configuration - MUST match your actual values
# ================================================================================
COGNITO_REGION = "us-east-1"
COGNITO_USER_POOL_ID = "us-east-1_X6Xtv869G"
COGNITO_FRONTEND_CLIENT_ID = "2akj9d7fa1fbnn5p08m017daap"
COGNITO_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
COGNITO_JWKS_URL = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

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

# Rate limiting and constraints
MAX_OUTPUT_DIMENSION = 2048  # All outputs capped here
MAX_IMAGE_SIZE_MB = 10       # Max input size
MAX_JOBS_PER_HOUR = 20       # Rate limit

# ================================================================================
# JWT Validation - fetch and cache Cognito public keys
# ================================================================================

@lru_cache(maxsize=1)
def _get_cognito_public_keys() -> Dict:
    """
    Fetch Cognito JWKS (public keys) from the well-known endpoint.
    Cached for the lifetime of the Lambda container (warm invocations).
    """
    logger.info(f"Cold start -- fetching Cognito JWKS from {COGNITO_JWKS_URL}")
    response = requests.get(COGNITO_JWKS_URL, timeout=5)
    response.raise_for_status()
    return response.json()


def _verify_cognito_token(token: str) -> Dict:
    """
    Verify Cognito token signature and issuer.
    Handles both:
      - Access tokens: carry `client_id` claim, token_use=="access"
      - ID tokens:     carry `aud` claim,       token_use=="id"
    The API Gateway COGNITO_USER_POOLS authorizer only passes ID tokens through;
    the Access-token path is kept for direct/test callers.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise jwt.DecodeError("Missing 'kid' in token header")
        
        jwks = _get_cognito_public_keys()
        
        public_key = None
        for key_data in jwks.get("keys", []):
            if key_data.get("kid") == kid:
                n = int.from_bytes(base64.urlsafe_b64decode(key_data['n'] + '=='), byteorder='big')
                e = int.from_bytes(base64.urlsafe_b64decode(key_data['e'] + '=='), byteorder='big')
                public_numbers = rsa.RSAPublicNumbers(e, n)
                public_key = public_numbers.public_key(default_backend())
                break
        
        if not public_key:
            raise jwt.DecodeError(f"No matching key found for kid={kid}")
        
        # Decode without audience verification first so we can inspect token_use.
        # Both token types share the same issuer and RS256 signature.
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=COGNITO_ISSUER,
            options={"verify_signature": True, "verify_iat": True, "verify_aud": False}
        )
        
        token_use = decoded.get("token_use")
        
        if token_use == "access":
            # Access token: validate via client_id claim
            token_client_id = decoded.get("client_id")
            if token_client_id != COGNITO_FRONTEND_CLIENT_ID:
                raise ValueError(f"Token client_id '{token_client_id}' does not match expected client")
            logger.info(f"JWT verified (access) -- sub={decoded.get('sub')}, client_id={token_client_id}")
        elif token_use == "id":
            # ID token: validate via aud claim
            token_aud = decoded.get("aud")
            if token_aud != COGNITO_FRONTEND_CLIENT_ID:
                raise ValueError(f"Token aud '{token_aud}' does not match expected client")
            logger.info(f"JWT verified (id) -- sub={decoded.get('sub')}, aud={token_aud}")
        else:
            raise ValueError(f"Unknown token_use: '{token_use}'. Expected 'access' or 'id'.")
        
        return decoded
        
    except jwt.ExpiredSignatureError:
        logger.warning("JWT expired")
        raise
    except jwt.InvalidSignatureError:
        logger.warning("JWT signature verification failed")
        raise
    except jwt.InvalidIssuerError:
        logger.warning(f"JWT issuer mismatch (expected {COGNITO_ISSUER})")
        raise
    except ValueError as e:
        logger.warning(f"JWT claim validation failed: {e}")
        raise
    except Exception as e:
        logger.error(f"JWT verification error: {type(e).__name__}: {e}")
        raise


def _extract_bearer_token(event: dict) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    headers = event.get("headers") or {}
    auth_header = headers.get("authorization") or headers.get("Authorization") or ""
    
    if not auth_header.startswith("Bearer "):
        return None
    
    return auth_header[7:]


def _get_user_id_from_jwt(event: dict) -> Tuple[Optional[str], Optional[Dict]]:
    """
    Extract and verify JWT token from request, return user ID (sub) and full claims.
    """
    token = _extract_bearer_token(event)
    
    if not token:
        logger.warning("Missing or malformed Authorization header")
        return None, {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": "Missing or invalid Authorization header"}),
        }
    
    try:
        claims = _verify_cognito_token(token)
        user_id = claims.get("sub")
        
        if not user_id:
            logger.error("Token missing 'sub' claim")
            return None, {
                "statusCode": 401,
                "headers": _cors_headers(event),
                "body": json.dumps({"error": "Token missing 'sub' claim"}),
            }
        
        return user_id, claims
        
    except jwt.ExpiredSignatureError:
        return None, {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": "Token expired"}),
        }
    except jwt.InvalidSignatureError:
        return None, {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": "Invalid token signature"}),
        }
    except (jwt.DecodeError, jwt.InvalidIssuerError, ValueError) as e:
        return None, {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": f"Invalid token: {str(e)}"}),
        }
    except Exception as e:
        logger.exception(f"Unexpected error verifying JWT")
        return None, {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": "Token verification failed"}),
        }


# ================================================================================
# CORS configuration
# ================================================================================

_CORS_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://localhost:4173",
}


def _get_cors_origin(event: dict) -> str:
    """Return the correct Access-Control-Allow-Origin value."""
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    if origin in _CORS_ALLOWED_ORIGINS:
        return origin
    return "*"


def _cors_headers(event: dict) -> Dict[str, str]:
    """Build CORS headers for the response."""
    origin = _get_cors_origin(event)
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    }
    if origin != "*":
        headers["Vary"] = "Origin"
    return headers


# ================================================================================
# Request Validation
# ================================================================================

def _validate_upscale_request(body: dict) -> Tuple[bool, str]:
    """
    Validate upscale request parameters.
    Returns (is_valid, error_message)
    """
    image_b64 = (body.get("image") or "").strip()
    
    if not image_b64:
        return False, "Missing required field: image (base64 string)"
    
    # Check base64 size (10MB max)
    image_size_mb = len(image_b64) / (1024 * 1024)
    if image_size_mb > MAX_IMAGE_SIZE_MB:
        return False, f"Image too large ({image_size_mb:.1f}MB). Maximum: {MAX_IMAGE_SIZE_MB}MB"
    
    # Validate scale_factor if provided (optional - will auto-calculate if not provided)
    # Accept both camelCase (scaleFactor) and snake_case (scale_factor) for compatibility.
    scale_factor = body.get("scale_factor") or body.get("scaleFactor")
    if scale_factor is not None:
        if not isinstance(scale_factor, int) or scale_factor not in [2, 4, 8, 16, 32]:
            return False, f"Invalid scale_factor: {scale_factor}. Must be 2, 4, 8, 16, or 32."
    
    return True, None


def _check_rate_limit(user_id: str) -> Tuple[bool, Optional[str]]:
    """
    Check if user has exceeded rate limit (MAX_JOBS_PER_HOUR per hour)
    Returns (is_allowed, error_message)
    """
    one_hour_ago = int(time.time()) - 3600
    current_time = int(time.time())
    
    try:
        response = _table.query(
            IndexName="UserHistoryIndex",
            KeyConditionExpression=Key("userId").eq(user_id) & Key("timestamp").between(one_hour_ago, current_time),
        )
        job_count = len(response.get("Items", []))
        
        if job_count >= MAX_JOBS_PER_HOUR:
            return False, f"Rate limit exceeded. Max {MAX_JOBS_PER_HOUR} upscales per hour."
        
        return True, None
    except Exception as e:
        logger.warning(f"Rate limit check failed: {e}")
        return True, None  # Allow if check fails


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
        elif method == "GET" and "/upscale/" in path and not path.endswith("/upscale"):
            return _handle_job_status(event, context)
        elif method == "GET" and path.endswith("/history"):
            return _handle_history(event, context)
        elif method == "GET" and path.endswith("/stats"):
            return _handle_user_stats(event, context)
        elif method == "OPTIONS":
            return _preflight_response(event)
        else:
            return _response(404, event, {"error": f"Route not found: {method} {path}"})

    except Exception as exc:
        logger.exception("Unhandled top-level error")
        return _response(500, event, {"error": "Internal server error", "detail": str(exc)})


# ================================================================================
# POST /upscale
# ================================================================================

def _handle_upscale(event, context):
    t_start = time.time()

    # -- Verify JWT and extract user ID -----------------------------------------------
    user_id, error_response = _get_user_id_from_jwt(event)
    if user_id is None:
        return error_response

    # -- Check rate limit --------------------------------------------------------
    is_allowed, error_msg = _check_rate_limit(user_id)
    if not is_allowed:
        return _response(429, event, {
            "error": error_msg,
            "retryAfter": 3600
        })

    # -- Parse request body -------------------------------------------------------
    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, event, {"error": "Request body must be valid JSON."})

    # -- Validate request ---------------------------------------------------------
    is_valid, error_msg = _validate_upscale_request(body)
    if not is_valid:
        return _response(400, event, {"error": error_msg})

    image_b64 = (body.get("image") or "").strip()
    # Accept both camelCase (scaleFactor) and snake_case (scale_factor) for compatibility.
    requested_scale_factor = body.get("scale_factor") or body.get("scaleFactor")  # None means auto-calculate

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
        img_format = pil_image.format
        if img_format not in _ALLOWED_FORMATS:
            _mark_failed(job_id)
            return _response(400, event, {
                "error": f"Unsupported image format: {img_format}. "
                         "Accepted formats: JPEG, PNG, WEBP."
            })
        pil_image = pil_image.convert("RGB")

        input_width, input_height = pil_image.size

        # -- Store original image in S3 -------------------------------------------
        ext = _FORMAT_EXT[img_format]
        orig_s3_key = f"original/{user_id}/{job_id}.{ext}"
        orig_s3_url = f"https://{_BUCKET}.s3.amazonaws.com/{orig_s3_key}"

        _s3.put_object(
            Bucket=_BUCKET,
            Key=orig_s3_key,
            Body=image_bytes,
            ContentType=_FORMAT_MIME[img_format],
        )

    except Exception as exc:
        _mark_failed(job_id)
        logger.exception("Failed to decode or store original image for jobId=%s", job_id)
        return _response(400, event, {"error": f"Could not decode or store image: {exc}"})

    # -- Update status to processing with original image reference ---------------
    _update_status(job_id, "processing", {
        "originalKey": orig_s3_key,
        "originalUrl": orig_s3_url,
    })

    # -- Run ML inference with dynamic scaling ------------------------------------
    try:
        result_image, img_meta = upscale_image(
            pil_image,
            scale_factor=requested_scale_factor  # None means auto-calculate
        )
    except ValueError as exc:
        _mark_failed(job_id)
        error_msg = str(exc)
        if "too large" in error_msg.lower():
            return _response(400, event, {
                "error": "Image too large",
                "detail": error_msg,
                "suggestion": "Please crop the image or upload a smaller version"
            })
        elif "blurry" in error_msg.lower():
            return _response(400, event, {
                "error": "Image quality issue",
                "detail": error_msg,
                "suggestion": "Try uploading a clearer image"
            })
        else:
            return _response(400, event, {"error": error_msg})
    except Exception as exc:
        logger.exception("Inference failed for jobId=%s", job_id)
        _mark_failed(job_id)
        return _response(500, event, {"error": f"Inference failed: {exc}"})

    processing_ms = int((time.time() - t_start) * 1000)
    actual_scale_factor = img_meta.get("actualScale") or requested_scale_factor or img_meta.get("scaleFactor") or 2

    # -- Save output to S3 -------------------------------------------------------
    try:
        buf     = io.BytesIO()
        quality = _FORMAT_QUALITY[img_format]
        if quality:
            result_image.save(buf, format=img_format, quality=quality)
        else:
            result_image.save(buf, format=img_format)
        buf.seek(0)

        ext    = _FORMAT_EXT[img_format]
        s3_key = f"output/{user_id}/{job_id}.{ext}"
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
        return _response(500, event, {"error": f"S3 upload failed: {exc}"})

    # -- Extract quality metadata -------------------------------------------------
    quality_assessment = img_meta.get("qualityAssessment", {})
    input_quality_score = quality_assessment.get("inputQualityScore", 50)
    is_blurry = quality_assessment.get("blurDetection", {}).get("isBlurry", False)
    scale_chain = img_meta.get("scalingChain", [])

    # -- Update DynamoDB with rich metadata ----------------------------------------
    try:
        _table.update_item(
            Key={"jobId": job_id},
            UpdateExpression=(
                "SET #st = :s, processedUrl = :u, originalKey = :ok, originalUrl = :ou, "
                "inputSize = :i, processingTimeMs = :t, imageFormat = :f, "
                "inputQuality = :q, qualityAssessment = :qa, "
                "scaleFactor = :sf, actualScaleFactor = :asf, scalingChain = :sc, "
                "isBlurry = :b, "
                "inputDimensions = :id, outputDimensions = :od, recommendations = :rec"
            ),
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":s": "done",
                ":u": processed_url,
                ":ok": orig_s3_key,
                ":ou": orig_s3_url,
                ":i": img_meta.get("inputSize", ""),
                ":t": processing_ms,
                ":f": img_format,
                ":q": _dynamo_safe(input_quality_score),
                ":qa": _dynamo_safe(quality_assessment),
                ":sf": requested_scale_factor or actual_scale_factor,
                ":asf": actual_scale_factor,
                ":sc": scale_chain,
                ":b": is_blurry,
                ":id": img_meta.get("inputSize", ""),
                ":od": img_meta.get("outputSize", ""),
                ":rec": _dynamo_safe(img_meta.get("recommendations", {})),
            },
        )
    except Exception as exc:
        logger.error("DynamoDB final update failed for jobId=%s: %s", job_id, exc)

    logger.info(json.dumps({
        "jobId":            job_id,
        "userId":           user_id,
        "status":           "done",
        "processingTimeMs": processing_ms,
        "scaleFactor":      actual_scale_factor,
        "scalingChain":     scale_chain,
        "outputUrl":        processed_url,
    }))

    presigned_orig_url = _presign(orig_s3_url)
    presigned_output_url = _presign(processed_url)

    return _response(200, event, {
        "jobId":              job_id,
        "originalUrl":        presigned_orig_url,
        "originalKey":        orig_s3_key,
        "outputUrl":          presigned_output_url,
        "processedUrl":       presigned_output_url,
        "status":             "done",
        "requestedScale":     requested_scale_factor,
        "actualScale":        actual_scale_factor,
        "scalingChain":       scale_chain,
        "upscaleMethod":      img_meta.get("upscaleMethod", "edsr"),
        "edsr_ssim":          img_meta.get("edsr_ssim"),
        "processingTimeMs":   processing_ms,
        "inputDimensions":    img_meta.get("inputSize", ""),
        "outputDimensions":   img_meta.get("outputSize", ""),
        "qualityAssessment":  quality_assessment,
        "timingBreakdown":    img_meta.get("timingBreakdown", {}),
        "recommendations":    img_meta.get("recommendations", {}),
    })

# ================================================================================
# GET /upscale/{jobId}/status
# ================================================================================

def _handle_job_status(event, context):
    """GET /upscale/{jobId}"""
    path = (event.get("path") or event.get("rawPath") or "").rstrip("/")
    job_id = path.split("/")[-1]
    
    user_id, error_response = _get_user_id_from_jwt(event)
    if user_id is None:
        return error_response
    
    try:
        response = _table.get_item(Key={"jobId": job_id})
        item = response.get("Item")
        
        if not item:
            return _response(404, event, {"error": "Job not found"})
        
        if item.get("userId") != user_id:
            return _response(403, event, {"error": "Unauthorized"})
        
        result_dict = {
            "jobId": job_id,
            "status": item.get("status"),
            "timestamp": item.get("timestamp"),
            "processingTimeMs": item.get("processingTimeMs"),
            "scaleFactor": item.get("scaleFactor"),
            "actualScaleFactor": item.get("actualScaleFactor"),
            "scalingChain": item.get("scalingChain", []),
            "inputQuality": item.get("inputQuality"),
            "inputDimensions": item.get("inputDimensions"),
            "outputDimensions": item.get("outputDimensions"),
        }

        orig_ref = item.get("originalUrl") or item.get("originalKey")
        if orig_ref:
            result_dict["originalUrl"] = _presign(orig_ref)
            if "originalKey" in item:
                result_dict["originalKey"] = item.get("originalKey")

        if item.get("status") == "done":
            presigned_proc = _presign(item.get("processedUrl", ""))
            result_dict["processedUrl"] = presigned_proc
            result_dict["outputUrl"] = presigned_proc
            result_dict["qualityAssessment"] = item.get("qualityAssessment", {})

        return _response(200, event, result_dict)
        
    except Exception as exc:
        logger.exception("Status query failed")
        return _response(500, event, {"error": "Failed to fetch job status"})

# ================================================================================
# GET /history
# ================================================================================

def _handle_history(event, context):
    user_id, error_response = _get_user_id_from_jwt(event)
    if user_id is None:
        return error_response

    try:
        result = _table.query(
            IndexName="UserHistoryIndex",
            KeyConditionExpression=Key("userId").eq(user_id),
            ScanIndexForward=False,
        )
    except Exception as exc:
        logger.exception("DynamoDB history query failed for userId=%s", user_id)
        return _response(500, event, {"error": "Failed to fetch history."})

    jobs = []
    for item in result.get("Items", []):
        orig_ref = item.get("originalUrl") or item.get("originalKey")
        orig_presigned = _presign(orig_ref) if orig_ref else None
        proc_presigned = _presign(item.get("processedUrl", "")) if item.get("status") == "done" else None
        jobs.append({
            "jobId":              item.get("jobId"),
            "status":             item.get("status"),
            "timestamp":          item.get("timestamp"),
            "processingTimeMs":   item.get("processingTimeMs"),
            "scaleFactor":        item.get("scaleFactor"),
            "actualScaleFactor":  item.get("actualScaleFactor"),
            "scalingChain":       item.get("scalingChain", []),
            "inputQuality":       item.get("inputQuality"),
            "inputDimensions":    item.get("inputDimensions"),
            "outputDimensions":   item.get("outputDimensions"),
            "originalUrl":        orig_presigned,
            "originalKey":        item.get("originalKey"),
            "processedUrl":       proc_presigned,
            "outputUrl":          proc_presigned,
        })

    return _response(200, event, {"jobs": jobs})

# ================================================================================
# GET /stats
# ================================================================================

def _handle_user_stats(event, context):
    """GET /stats"""
    user_id, error_response = _get_user_id_from_jwt(event)
    if user_id is None:
        return error_response
    
    try:
        result = _table.query(
            IndexName="UserHistoryIndex",
            KeyConditionExpression=Key("userId").eq(user_id),
        )
        
        items = result.get("Items", [])
        completed_items = [i for i in items if i.get("status") == "done"]
        
        if not completed_items:
            return _response(200, event, {
                "userId": user_id,
                "totalImages": 0,
                "totalProcessingTimeMs": 0,
                "averageProcessingTimeMs": 0,
                "averageScaleFactor": 0,
                "averageInputQuality": 0,
            })
        
        total_processing_time = sum(int(i.get("processingTimeMs", 0)) for i in completed_items)
        
        quality_scores = [
            float(i.get("inputQuality", 50))
            for i in completed_items if "inputQuality" in i
        ]
        
        scale_factors = [
            int(i.get("actualScaleFactor") or i.get("scaleFactor"))
            for i in completed_items if i.get("scaleFactor") or i.get("actualScaleFactor")
        ]
        
        return _response(200, event, {
            "userId": user_id,
            "totalImages": len(completed_items),
            "totalProcessingTimeMs": total_processing_time,
            "averageProcessingTimeMs": int(total_processing_time / len(completed_items)) if completed_items else 0,
            "averageScaleFactor": round(sum(scale_factors) / len(scale_factors), 2) if scale_factors else 0,
            "averageInputQuality": round(sum(quality_scores) / len(quality_scores), 1) if quality_scores else 0,
        })
    except Exception as exc:
        logger.exception("Stats query failed")
        return _response(500, event, {"error": "Failed to fetch statistics"})

# ================================================================================
# Helpers
# ================================================================================

def _mark_failed(job_id: str):
    """Best-effort status update to 'failed'. Swallows exceptions."""
    try:
        _update_status(job_id, "failed")
    except Exception:
        pass


def _dynamo_safe(val):
    """Convert floats to Decimal recursively so DynamoDB boto3 accepts them."""
    if isinstance(val, float):
        return Decimal(str(round(val, 4)))
    elif isinstance(val, dict):
        return {k: _dynamo_safe(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [_dynamo_safe(v) for v in val]
    return val


def _update_status(job_id: str, status: str, extra_attrs: Optional[dict] = None):
    expr = "SET #st = :s"
    names = {"#st": "status"}
    values = {":s": status}
    if extra_attrs:
        for k, v in extra_attrs.items():
            expr += f", #{k} = :{k}"
            names[f"#{k}"] = k
            values[f":{k}"] = _dynamo_safe(v)
    _table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def _json_default(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    raise TypeError(f"Not JSON serializable: {type(o)}")


def _presign(url_or_key: Optional[str]) -> Optional[str]:
    """Turn a stored S3 URL or S3 key into a temporary signed GET URL."""
    if not url_or_key:
        return None
    prefix = f"https://{_BUCKET}.s3.amazonaws.com/"
    if url_or_key.startswith(prefix):
        key = url_or_key[len(prefix):]
    elif url_or_key.startswith("http://") or url_or_key.startswith("https://"):
        return url_or_key
    else:
        key = url_or_key
    try:
        return _s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": _BUCKET, "Key": key},
            ExpiresIn=3600,
        )
    except Exception as exc:
        logger.warning(f"Presign failed for {url_or_key}: {exc}")
        return url_or_key


def _preflight_response(event: dict) -> dict:
    """Return a correct CORS preflight (OPTIONS) response."""
    return {
        "statusCode": 200,
        "headers": _cors_headers(event),
        "body": "",
    }

def _response(status_code: int, event: dict, body: dict) -> dict:
    """Build a JSON response with correct CORS headers."""
    return {
        "statusCode": status_code,
        "headers": _cors_headers(event),
        "body": json.dumps(body, default=_json_default),
    }