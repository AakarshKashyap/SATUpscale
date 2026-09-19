"""
satup-setup - End-to-End Test Suite
Tests upscale.py (real inference) + lambda_handler.py (mocked AWS)
Run from: ~/satup-setup/lambda/
"""

import sys, os, io, json, base64, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
from unittest.mock import MagicMock, patch

PASS = "[PASS]"
FAIL = "[FAIL]"
results = []

def check(name, fn):
    try:
        fn()
        print(f"{PASS} {name}")
        results.append((name, True, None))
    except Exception as e:
        print(f"{FAIL} {name}")
        print(f"       {e}")
        results.append((name, False, str(e)))

def make_b64(path=None, size=(64,64), color=(100,120,80), fmt="PNG"):
    """Return base64 string of a real or synthetic image."""
    if path and os.path.exists(path):
        img = Image.open(path).convert("RGB")
    else:
        img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()

TEST_IMG_64  = "/home/washed/satup-setup/model_benchmark/test_images/chained/AnnualCrop_0_input64.png"
TEST_IMG_FOR = "/home/washed/satup-setup/model_benchmark/test_images/chained/Forest_0_input64.png"

print("=" * 60)
print("  satup-setup Lambda - End-to-End Test Suite")
print("=" * 60)

# ── Section 1: upscale.py (real inference) ────────────────────────
print("\n[1] upscale.py - Real Inference Tests")
print("-" * 40)

from upscale import upscale_image, MAX_INPUT_PX, INFERENCE_CAP_PX

def test_64x64_real():
    img = Image.open(TEST_IMG_64).convert("RGB")
    result, meta = upscale_image(img)
    assert result.size == (512, 512), f"Expected 512x512, got {result.size}"
    assert meta["inputSize"] == "64x64"
    assert meta["outputSize"] == "512x512"
    assert "postProcessing" in meta  # CLAHE now handles contrast
    assert 1.0 <= meta["color"] <= 1.40
check("64x64 input -> 512x512 output (AnnualCrop)", test_64x64_real)

def test_forest_color():
    img = Image.open(TEST_IMG_FOR).convert("RGB")
    result, meta = upscale_image(img)
    # Forest should not over-saturate (color bleed fix)
    assert meta["color"] <= 1.25, f"Forest over-saturated: color={meta['color']}"
check("Forest color bleed protection (sat should be <= 1.25)", test_forest_color)

def test_128x128():
    img = Image.new("RGB", (128, 128), (80, 100, 60))
    result, meta = upscale_image(img)
    assert result.size == (1024, 1024), f"Expected 1024x1024, got {result.size}"
check("128x128 input -> 1024x1024 output", test_128x128)

def test_300x200_resize():
    img = Image.new("RGB", (300, 200), (100, 80, 60))
    result, meta = upscale_image(img)
    # 300x200 > 256 cap -> longest side scaled to 256 -> 256x170 inference
    assert meta["inferenceSize"] == "256x170", f"Got inference size: {meta['inferenceSize']}"
    # Output = 8x inference size
    assert result.size == (2048, 1360), f"Got {result.size}"
check("300x200 input -> aspect-ratio preserved resize -> 2048x1360", test_300x200_resize)

def test_reject_oversized():
    img = Image.new("RGB", (2049, 100), (0,0,0))
    try:
        upscale_image(img)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "too large" in str(e).lower()
check("2049px wide image -> ValueError (rejected)", test_reject_oversized)

def test_jpeg_mode():
    img = Image.new("RGB", (64, 64), (200, 150, 100))
    result, meta = upscale_image(img)
    assert result.mode == "RGB"
check("RGB mode preserved through pipeline", test_jpeg_mode)

def test_timing():
    img = Image.open(TEST_IMG_64).convert("RGB")
    t = time.time()
    result, meta = upscale_image(img)
    elapsed = time.time() - t
    assert elapsed < 10.0, f"Too slow: {elapsed:.2f}s (Lambda limit 60s, target <2s)"
    print(f"       inference time: {elapsed:.2f}s")
check("Inference time < 10s", test_timing)

# ── Section 2: lambda_handler.py (mocked AWS) ─────────────────────
print("\n[2] lambda_handler.py - Handler Tests (mocked AWS)")
print("-" * 40)

# Mock all AWS calls before importing handler
mock_table  = MagicMock()
mock_s3     = MagicMock()
mock_dynamo = MagicMock()
mock_dynamo.Table.return_value = mock_table
mock_table.query.return_value = {
    "Items": [
        {"jobId": "abc-123", "userId": "user-1", "processedUrl": "https://s3.example.com/output/abc-123.png",
         "timestamp": 1700000000, "status": "done", "originalUrl": None}
    ]
}

with patch("boto3.client", return_value=mock_s3), \
     patch("boto3.resource", return_value=mock_dynamo):
    import lambda_handler as lh

def make_upscale_event(user_id, image_b64, is_b64_encoded=False):
    return {
        "httpMethod": "POST",
        "path": "/upscale",
        "isBase64Encoded": is_b64_encoded,
        "body": json.dumps({"userId": user_id, "image": image_b64}),
    }

class FakeContext:
    aws_request_id = "test-req-001"

ctx = FakeContext()

def test_missing_userid():
    event = {"httpMethod": "POST", "path": "/upscale", "body": json.dumps({"image": "abc"})}
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 400
    assert "userId" in r["body"]
check("POST /upscale missing userId -> 400", test_missing_userid)

def test_missing_image():
    event = {"httpMethod": "POST", "path": "/upscale", "body": json.dumps({"userId": "u1"})}
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 400
    assert "image" in r["body"]
check("POST /upscale missing image -> 400", test_missing_image)

def test_bad_base64():
    event = make_upscale_event("u1", "not-valid-base64!!!")
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 400
check("POST /upscale invalid base64 -> 400", test_bad_base64)

def test_successful_upscale():
    b64 = make_b64(TEST_IMG_64)
    event = make_upscale_event("user-123", b64)
    r = lh.handler(event, ctx)
    body = json.loads(r["body"])
    assert r["statusCode"] == 200, f"Got {r['statusCode']}: {r['body']}"
    assert "jobId" in body
    assert "outputUrl" in body
    assert body["status"] == "done"
    assert "srm-upscaler-outputs" in body["outputUrl"]
    # Check S3 put was called
    mock_s3.put_object.assert_called()
    # Check DynamoDB put was called
    mock_table.put_item.assert_called()
check("POST /upscale success -> 200 with jobId + outputUrl", test_successful_upscale)

def test_cors_headers():
    b64 = make_b64(TEST_IMG_64)
    event = make_upscale_event("user-123", b64)
    r = lh.handler(event, ctx)
    assert r["headers"]["Access-Control-Allow-Origin"] == "*"
check("CORS headers present on response", test_cors_headers)

def test_options_preflight():
    event = {"httpMethod": "OPTIONS", "path": "/upscale"}
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 200
check("OPTIONS preflight -> 200", test_options_preflight)

def test_history_missing_userid():
    event = {"httpMethod": "GET", "path": "/history", "queryStringParameters": {}}
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 400
check("GET /history missing userId -> 400", test_history_missing_userid)

def test_history_returns_jobs():
    event = {"httpMethod": "GET", "path": "/history",
             "queryStringParameters": {"userId": "user-1"}}
    r = lh.handler(event, ctx)
    body = json.loads(r["body"])
    assert r["statusCode"] == 200
    assert "jobs" in body
    assert len(body["jobs"]) == 1
    assert body["jobs"][0]["jobId"] == "abc-123"
check("GET /history -> 200 with jobs array", test_history_returns_jobs)

def test_route_not_found():
    event = {"httpMethod": "GET", "path": "/unknown"}
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 404
check("Unknown route -> 404", test_route_not_found)

def test_v2_api_gateway_format():
    # HTTP API Gateway v2 uses different event shape
    b64 = make_b64(TEST_IMG_64)
    event = {
        "rawPath": "/upscale",
        "requestContext": {"http": {"method": "POST"}},
        "isBase64Encoded": False,
        "body": json.dumps({"userId": "user-v2", "image": b64}),
    }
    r = lh.handler(event, ctx)
    assert r["statusCode"] == 200
check("HTTP API Gateway v2 event format -> 200", test_v2_api_gateway_format)

# ── Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
print(f"  Results: {passed} passed, {failed} failed out of {len(results)} tests")
if failed:
    print("\n  Failed tests:")
    for name, ok, err in results:
        if not ok:
            print(f"    {FAIL} {name}")
            print(f"         {err}")
    sys.exit(1)
else:
    print("  All tests passed!")
print("=" * 60)
