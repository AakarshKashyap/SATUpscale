# SATUpscale Backend Architecture

The SATUpscale backend is implemented as a cloud-native, containerized AWS Lambda microservice powered by **PyTorch**, **OpenCV**, **Amazon S3**, **Amazon DynamoDB**, and **Amazon Cognito**.

---

## Architectural Model: Consolidated Container vs Micro-Functions

Historically, serverless applications utilized fragmented individual Lambda functions for each route (e.g. `create-job`, `generate-upload-url`, `get-history`, `get-job`). In SATUpscale, these functions are unified into a single containerized Lambda handler ([`ml/inference/lambda_handler.py`](../ml/inference/lambda_handler.py)):

```text
                               ┌─────────────────────────────────┐
                               │       AWS API Gateway           │
                               │  https://<API_ID>/prod          │
                               └────────────────┬────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     │                                                     │
               POST /upscale                                         GET /history
                     │                                                     │
                     ▼                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│              Consolidated Lambda Handler (ml/inference/lambda_handler.py)        │
│                                                                                  │
│ • JWT Verification (sub = userId)            • Dynamic EDSR Model Chaining       │
│ • DynamoDB 20 req/hr Rate Limiter            • Dual-Asset S3 Upload (Orig + Out) │
│ • Quality & Blur Assessment                  • Presigned URL Generation (1 hr)   │
└──────────────────────────────────────────────────────────────────────────────────┘
                     │                                                     │
                     ▼                                                     ▼
               GET /stats                                            GET /upscale/{jobId}
```

### Why a Consolidated Container?
1. **Model Cache Sharing**: The PyTorch EDSR neural network weights are loaded once during Lambda cold start into memory (~675 MB) and reused across warm invocations.
2. **Zero Cold-Start Overhead on Auxiliary Routes**: Requests to `/history` or `/stats` execute in <50ms without spinning up separate Python runtimes.
3. **Atomic State Transactions**: Coordinates S3 asset writes and DynamoDB status transitions within a single execution lifecycle.

---

## API Endpoints & Route Reference

All endpoints (except `OPTIONS`) require an `Authorization: Bearer <IdToken>` header containing a valid AWS Cognito ID Token.

| Method | Path | Description | Access Control |
| :--- | :--- | :--- | :--- |
| `POST` | `/upscale` | Submit base64 satellite raster for AI enhancement | Authenticated (`20 req/hr`) |
| `GET` | `/history` | Fetch paginated history of user's past enhancement jobs | Authenticated (Tenant Isolated) |
| `GET` | `/stats` | Fetch aggregate statistics (total tiles, avg scale, runtime) | Authenticated (Tenant Isolated) |
| `GET` | `/upscale/{jobId}` | Retrieve fresh 1-hour presigned URLs for a specific job | Authenticated (Owner Only) |
| `OPTIONS` | `/*` | CORS preflight handler returning allowed headers | Public |

For detailed JSON schemas and sample payloads, see [`SCHEMA.md`](../SCHEMA.md).

---

## Local Development & Container Testing

### 1. Build Container Image Locally
```bash
docker build -t saTupscale-backend -f ml/inference/Dockerfile ml/inference/
```

### 2. Run Container Locally (AWS Lambda RIE)
```bash
docker run -p 9000:8080 \
  -e S3_BUCKET="srm-upscaler-outputs" \
  -e DYNAMO_TABLE="SRMJobs" \
  -e COGNITO_USER_POOL_ID="us-east-1_XXXXXXXXX" \
  -e COGNITO_CLIENT_ID="YYYYYYYYYYYYYYYYYYYYYYYY" \
  satupscale-backend
```

### 3. Deploy to AWS ECR and Lambda
```bash
# Authenticate Docker to AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag saTupscale-backend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/satupscale-upscaler:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/satupscale-upscaler:latest

# Update Lambda function code
aws lambda update-function-code \
  --function-name saTupscale-upscaler \
  --image-uri <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/satupscale-upscaler:latest \
  --region us-east-1
```
