"""
satup-setup - AWS Lambda Handler with JWT Validation
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
from typing import Dict, Tuple, Optional
from functools import lru_cache

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


# ================================================================================
# JWT Validation - fetch and cache Cognito public keys
# ================================================================================

@lru_cache(maxsize=1)
def _get_cognito_public_keys() -> Dict:
    """
    Fetch Cognito JWKS (public keys) from the well-known endpoint.
    Cached for the lifetime of the Lambda container (warm invocations).
    
    Returns:
        {"keys": [{"kid": "...", "kty": "RSA", "n": "...", "e": "..."}, ...]}
    
    Raises:
        requests.RequestException if the fetch fails
    """
    logger.info(f"Cold start -- fetching Cognito JWKS from {COGNITO_JWKS_URL}")
    response = requests.get(COGNITO_JWKS_URL, timeout=5)
    response.raise_for_status()
    return response.json()


def _verify_cognito_access_token(token: str) -> Dict:
    """
    Verify Cognito ACCESS token signature, issuer, and client_id.
    
    Args:
        token: Raw JWT string (without "Bearer " prefix)
    
    Returns:
        Decoded token claims dict with verified `sub` claim.
    
    Raises:
        jwt.InvalidSignatureError   - signature verification failed
        jwt.DecodeError             - malformed token
        jwt.InvalidIssuerError      - issuer doesn't match Cognito
        ValueError              - client_id doesn't match App Client ID
        jwt.ExpiredSignatureError   - token expired
    """
    try:
        # Decode WITHOUT verification first to get the header (which contains `kid`)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise jwt.DecodeError("Missing 'kid' in token header")
        
        # Fetch Cognito public keys
        jwks = _get_cognito_public_keys()
        
        # Find the key matching the token's `kid`
        public_key = None
        for key_data in jwks.get("keys", []):
            if key_data.get("kid") == kid:
                # Convert JWK to RSA public key
                n = int.from_bytes(base64.urlsafe_b64decode(key_data['n'] + '=='), byteorder='big')
                e = int.from_bytes(base64.urlsafe_b64decode(key_data['e'] + '=='), byteorder='big')
                public_numbers = rsa.RSAPublicNumbers(e, n)
                public_key = public_numbers.public_key(default_backend())
                break
        
        if not public_key:
            raise jwt.DecodeError(f"No matching key found for kid={kid}")
        
        # Verify: signature + issuer + client_id (for ACCESS token, not `aud`)
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=COGNITO_ISSUER,
            options={"verify_signature": True, "verify_iat": True}
        )
        
        # For ACCESS tokens, client_id is present instead of aud
        token_client_id = decoded.get("client_id")
        VALID_CLIENT_IDS = [ COGNITO_FRONTEND_CLIENT_ID]
        if token_client_id not in VALID_CLIENT_IDS:
            raise ValueError(f"Token client_id '{token_client_id}' does not match valid client IDs")
        
        logger.info(f"JWT verified -- sub={decoded.get('sub')}, client_id={token_client_id}")
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
    """
    Extract Bearer token from Authorization header.
    
    Args:
        event: Lambda proxy event
    
    Returns:
        Token string (without "Bearer " prefix) or None if missing/malformed
    """
    headers = event.get("headers") or {}
    auth_header = headers.get("authorization") or headers.get("Authorization") or ""
    
    if not auth_header.startswith("Bearer "):
        return None
    
    return auth_header[7:]  # Remove "Bearer " prefix


def _get_user_id_from_jwt(event: dict) -> Tuple[Optional[str], Optional[Dict]]:
    """
    Extract and verify JWT token from request, return user ID (sub) and full claims.
    
    Args:
        event: Lambda proxy event
    
    Returns:
        (user_id: str, claims: dict) on success
        (None, error_response_dict) on failure (401)
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
        claims = _verify_cognito_access_token(token)
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
    "http://localhost:4173",   # vite preview
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

    # -- Parse request body -------------------------------------------------------
    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, event, {"error": "Request body must be valid JSON."})

    image_b64 = (body.get("image") or "").strip()

    if not image_b64:
        return _response(400, event, {"error": "Missing required field: image (base64 string)"})

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

    except Exception as exc:
        _mark_failed(job_id)
        return _response(400, event, {"error": f"Could not decode image: {exc}"})

    # -- Update status to processing ---------------------------------------------
    _update_status(job_id, "processing")

    # -- Run ML inference --------------------------------------------------------
    try:
        result_image, img_meta = upscale_image(pil_image)
    except ValueError as exc:
        _mark_failed(job_id)
        return _response(400, event, {"error": str(exc)})
    except Exception as exc:
        logger.exception("Inference failed for jobId=%s", job_id)
        _mark_failed(job_id)
        return _response(500, event, {"error": f"Inference failed: {exc}"})

    processing_ms = int((time.time() - t_start) * 1000)

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

    # -- Update DynamoDB to done -------------------------------------------------
    try:
        _table.update_item(
            Key={"jobId": job_id},
            UpdateExpression=(
                "SET #st = :s, processedUrl = :u, "
                "inputSize = :i, processingTimeMs = :t, imageFormat = :f"
            ),
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":s": "done",
                ":u": processed_url,
                ":i": img_meta["inputSize"],
                ":t": processing_ms,
                ":f": img_format,
            },
        )
    except Exception as exc:
        logger.error("DynamoDB final update failed for jobId=%s: %s", job_id, exc)

    logger.info(json.dumps({
        "jobId":            job_id,
        "userId":           user_id,
        "status":           "done",
        "processingTimeMs": processing_ms,
        "outputUrl":        processed_url,
        **img_meta,
    }))

    return _response(200, event, {
        "jobId":     job_id,
        "outputUrl": _presign(processed_url),
        "status":    "done",
    })

# ================================================================================
# GET /history?userId=...
# ================================================================================

def _handle_history(event, context):
    # -- Verify JWT and extract user ID -----------------------------------------------
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

    jobs = [
        {
            "jobId":        item.get("jobId"),
            "originalUrl":  item.get("originalUrl"),
            "processedUrl": _presign(item.get("processedUrl")),
            "timestamp":    item.get("timestamp"),
            "status":       item.get("status"),
        }
        for item in result.get("Items", [])
    ]

    return _response(200, event, {"jobs": jobs})

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