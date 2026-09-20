# SATUpscale Cloud Infrastructure

SATUpscale operates on a fully serverless, multi-tenant AWS architecture designed for high-throughput image super-resolution, cost predictability, and zero-trust data isolation.

---

## Architecture Overview

```text
                     ┌────────────────────────┐
                     │    AWS API Gateway     │
                     │  (REST API / HTTP v2)  │
                     └───────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │ Authorizer          │ Routes:             │
           │ (Cognito RS256)     │ POST /upscale       │
           │                     │ GET  /history       │
           │                     │ GET  /stats         │
           │                     │ GET  /upscale/{id}  │
           ▼                     ▼                     │
┌──────────────────────┐  ┌──────────────────────┐     │
│   AWS Cognito Pool   │  │   AWS Lambda Core    │◄────┘
│  (Auth & Identity)   │  │ (Docker / PyTorch ML)│
└──────────────────────┘  └──────────┬───────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────────────┐            ┌──────────────────────────────┐
│       Amazon DynamoDB        │            │          Amazon S3           │
│     (SRMJobs Table & GSI)    │            │     (Private Asset Store)    │
│                              │            │                              │
│ • PK: jobId                  │            │ • original/{userId}/{jobId}  │
│ • GSI: UserHistoryIndex      │            │ • output/{userId}/{jobId}    │
│ • TTL: 48 hours              │            │ • 48-Hour Lifecycle Delete   │
└──────────────────────────────┘            └──────────────────────────────┘
```

---

## AWS Services & Components

### 1. AWS Lambda (`satupscale-upscaler`)
- **Runtime**: Container Image (`Linux / Python 3.10 / PyTorch / OpenCV`).
- **Memory**: 3,008 MB – 4,096 MB (configured for high-speed tensor operations).
- **Timeout**: 15 seconds.
- **Environment Variables**:
  - `S3_BUCKET`: Name of private storage bucket (`srm-upscaler-outputs`).
  - `DYNAMO_TABLE`: DynamoDB job tracking table (`SRMJobs`).
  - `COGNITO_USER_POOL_ID`: Cognito User Pool for RS256 JWKS verification.
  - `COGNITO_CLIENT_ID`: Expected frontend audience claim (`aud`).
  - `ALLOWED_ORIGINS`: Comma-separated CORS allowed domains.

### 2. Amazon S3 (`srm-upscaler-outputs`)
- **Block Public Access**: Fully enabled (`BlockPublicPolicy=true`).
- **Access Model**: Strict pre-signed URLs with 1-hour expiration (`GetObject`).
- **Key Prefix Partitioning**:
  - `original/{userId}/{jobId}.ext` — Captured low-resolution source.
  - `output/{userId}/{jobId}.ext` — High-resolution EDSR enhanced raster.
- **Lifecycle Rule**: Automatic expiration and permanent deletion after **48 hours** to enforce cost discipline.

### 3. Amazon DynamoDB (`SRMJobs`)
- **Billing Mode**: Pay-Per-Request (`PAY_PER_REQUEST`).
- **Primary Key**: `jobId` (String).
- **Global Secondary Index (GSI)**:
  - Name: `UserHistoryIndex`
  - Partition Key: `userId` (String)
  - Sort Key: `createdAt` (Number)
  - Projection: `ALL`
- **Time-to-Live (TTL)**: Enabled on the `ttl` attribute (Unix epoch + 48 hours), automatically purging database items alongside expired S3 objects.

### 4. Amazon Cognito User Pool
- Handles user registration, verification emails, password resets, and JWT issuance.
- API Gateway uses a `COGNITO_USER_POOLS` authorizer that validates the client's `IdToken`.

---

## IAM Permissions & Data Policy

The Lambda execution role requires access to S3 and DynamoDB. The least-privilege policy template is defined in [`lambda-data-policy.json`](lambda-data-policy.json):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3AssetStorageAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::srm-upscaler-outputs/*"
    },
    {
      "Sid": "DynamoDBJobTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/SRMJobs",
        "arn:aws:dynamodb:us-east-1:<ACCOUNT_ID>:table/SRMJobs/index/UserHistoryIndex"
      ]
    }
  ]
}
```

---

## Deployment Options

This directory provides infrastructure definitions for multiple deployment strategies:
- [**AWS SAM Deployment**](sam/README.md): Serverless Application Model template for automated CloudFormation stack provisioning.
- [**Terraform Module**](terraform/README.md): HashiCorp Terraform modules for infrastructure-as-code orchestration.
- **Bootstrap Shell Script**: Quick-start configuration via the root [`setup.sh`](../setup.sh) script using the AWS CLI.
