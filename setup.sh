#!/bin/bash
# ============================================================
# SRM Upscaler - S3 + DynamoDB Infrastructure Setup
# Owner: S3 + DynamoDB role
# Run this once with AWS CLI configured (aws configure)
# ============================================================

set -e  # stop on first error

REGION="us-east-1"
BUCKET_NAME="srm-upscaler-outputs"   # change if taken - S3 names are globally unique
TABLE_NAME="SRMJobs"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Using Account: $ACCOUNT_ID | Region: $REGION"

# ------------------------------------------------------------
# 1. CREATE S3 BUCKET
# ------------------------------------------------------------
echo "Creating S3 bucket: $BUCKET_NAME"
aws s3 mb s3://$BUCKET_NAME --region $REGION

# Allow public policies to be attached (needed before adding bucket policy)
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# ------------------------------------------------------------
# 2. BUCKET POLICY - public read on /output/* only
# ------------------------------------------------------------
cat > bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadOutputs",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/output/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json
echo "Bucket policy applied (public read on /output/*)"

# ------------------------------------------------------------
# 3. CORS CONFIG - allow extension/website to fetch images
# ------------------------------------------------------------
cat > cors-config.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration file://cors-config.json
echo "CORS applied"

# ------------------------------------------------------------
# 4. LIFECYCLE RULE - auto-delete outputs after 2 days (cost control)
# ------------------------------------------------------------
cat > lifecycle-config.json <<EOF
{
  "Rules": [
    {
      "ID": "ExpireOutputs",
      "Filter": { "Prefix": "output/" },
      "Status": "Enabled",
      "Expiration": { "Days": 2 }
    },
    {
      "ID": "ExpireInputs",
      "Filter": { "Prefix": "input/" },
      "Status": "Enabled",
      "Expiration": { "Days": 2 }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET_NAME \
  --lifecycle-configuration file://lifecycle-config.json
echo "Lifecycle rule applied (auto-expire after 2 days)"

# ------------------------------------------------------------
# 5. CREATE DYNAMODB TABLE with history GSI (userId + timestamp)
# ------------------------------------------------------------
echo "Creating DynamoDB table: $TABLE_NAME"

aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions \
      AttributeName=jobId,AttributeType=S \
      AttributeName=userId,AttributeType=S \
      AttributeName=timestamp,AttributeType=N \
  --key-schema AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
        "IndexName": "UserHistoryIndex",
        "KeySchema": [
          {"AttributeName":"userId","KeyType":"HASH"},
          {"AttributeName":"timestamp","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

echo "Waiting for table to become active..."
aws dynamodb wait table-exists --table-name $TABLE_NAME --region $REGION

# ------------------------------------------------------------
# 6. ENABLE TTL for auto-cleanup (matches S3 lifecycle)
# ------------------------------------------------------------
aws dynamodb update-time-to-live \
  --table-name $TABLE_NAME \
  --time-to-live-specification "Enabled=true, AttributeName=ttl" \
  --region $REGION
echo "TTL enabled on 'ttl' attribute"

# ------------------------------------------------------------
# 7. IAM POLICY for Lambda (S3 + DynamoDB access, scoped)
# ------------------------------------------------------------
cat > lambda-data-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ReadWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    },
    {
      "Sid": "DynamoDBReadWrite",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/$TABLE_NAME",
        "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/$TABLE_NAME/index/UserHistoryIndex"
      ]
    }
  ]
}
EOF

echo ""
echo "============================================================"
echo "DONE. Summary:"
echo "  S3 bucket:       $BUCKET_NAME"
echo "  DynamoDB table:  $TABLE_NAME (with UserHistoryIndex GSI)"
echo "  IAM policy file: lambda-data-policy.json (give to Lambda dev)"
echo "============================================================"
echo ""
echo "Share with your team:"
echo "  BUCKET_NAME=$BUCKET_NAME"
echo "  TABLE_NAME=$TABLE_NAME"
echo "  REGION=$REGION"
