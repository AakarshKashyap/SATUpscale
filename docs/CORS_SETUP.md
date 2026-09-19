# CORS Setup for SATUpscale API Gateway (REST API v1)
# ====================================================
# API endpoint: https://{id}.execute-api.us-east-1.amazonaws.com/prod/upscale
# Problem: OPTIONS preflight from http://localhost:5173 is rejected by API Gateway
# before reaching the Lambda, because no OPTIONS method is configured on /upscale.

## Root Cause

REST API Gateway (v1) does NOT automatically handle OPTIONS requests.
You must explicitly add an OPTIONS method to every resource that the browser calls.
Without it, API Gateway returns 403 Missing Authentication Token with zero CORS headers,
which causes net::ERR_FAILED on the preflight before the Lambda is ever invoked.

The Lambda code (lambda_handler.py) already returns correct CORS headers on every response,
but the OPTIONS request never reaches the Lambda in the first place.

## Fix: Add OPTIONS Method to /upscale in the API Gateway Console

### Step 1 – Open API Gateway

1. Go to: https://console.aws.amazon.com/apigateway
2. Select your API (the one at 0237u8c62 or similar).
3. In the left panel, click Resources.
4. Select the /upscale resource.

### Step 2 – Add an OPTIONS Method

1. Click Actions → Create Method.
2. Select OPTIONS from the dropdown, click the checkmark.
3. In the setup screen:
   - Integration type: MOCK  (not Lambda – this is the simplest approach)
   - Click Save.

### Step 3 – Configure the Mock Integration Response

After creating the OPTIONS method with Mock integration:

1. Click Integration Response.
2. Expand the 200 row.
3. Under Header Mappings, add these three mappings:
   (Response header → Mapping value)

   Access-Control-Allow-Headers  → 'Content-Type,Authorization'
   Access-Control-Allow-Methods  → 'POST,OPTIONS'
   Access-Control-Allow-Origin   → 'http://localhost:5173'

   IMPORTANT: The values must be enclosed in single quotes inside the mapping field.
   Example: the field literally contains  'http://localhost:5173'  (with quotes).

4. Click Save.

5. Click Method Response, expand 200, and confirm these response headers are listed:
   - Access-Control-Allow-Headers
   - Access-Control-Allow-Methods
   - Access-Control-Allow-Origin
   If they are not listed, click Add Header and add them.

### Step 4 – Ensure the POST Method Also Returns CORS Headers

The Lambda now echoes the correct origin in every response via _response().
However you must also confirm the POST method's Integration Response
does NOT override/strip headers set by the Lambda proxy response.

If the POST method uses Lambda Proxy Integration (which it should), the Lambda's
response headers pass through unmodified — no additional configuration needed.

To verify: Click the POST method → Integration Request → confirm it says
"Use Lambda Proxy Integration" is checked.

### Step 5 – Deploy the API

After any change to methods or integrations, you MUST redeploy for changes to take effect.

1. Click Actions → Deploy API.
2. Select Stage: prod.
3. Click Deploy.

Without this step, none of the changes above will be live.

## Alternative: Lambda Proxy on OPTIONS (instead of Mock)

If you prefer the Lambda to handle OPTIONS (e.g. for dynamic origin checking),
instead of Mock integration in Step 3:

- Set Integration type: Lambda Function
- Check: Use Lambda Proxy Integration
- Point it at the same Lambda function

The lambda_handler.py already handles OPTIONS at line ~118 via _preflight_response(event),
which correctly echoes http://localhost:5173 when that is the request Origin.

## Quick Verification Test

After deploying, run this in your terminal (replace the ID with the real one):

  curl -v -X OPTIONS \
    "https://{your-api-id}.execute-api.us-east-1.amazonaws.com/prod/upscale" \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type"

Expected response:
  HTTP/2 200
  access-control-allow-origin: http://localhost:5173
  access-control-allow-methods: POST,OPTIONS
  access-control-allow-headers: Content-Type,Authorization

If you see HTTP 200 with those three headers, the preflight is fixed.
Then test the actual POST from the browser at http://localhost:5173/enhance.

## In Chrome DevTools

1. Open http://localhost:5173/enhance
2. Open DevTools → Network tab
3. Upload an image and click "Upscale 8x"
4. Look for the OPTIONS request to /upscale — it should now show status 200
5. Look for the POST request — it should show status 200 with a JSON body
   containing { "jobId": "...", "outputUrl": "...", "status": "done" }

## Production / Deployment Domain

When you deploy the frontend to a real domain, add that origin to the Lambda:

  _CORS_ALLOWED_ORIGINS = {
      "http://localhost:5173",
      "http://localhost:4173",
      "https://your-production-domain.com",   # <-- add this
  }

Then redeploy the Lambda and API Gateway.
