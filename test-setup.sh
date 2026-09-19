#!/bin/bash
# Quick manual verification of S3 + DynamoDB setup
# Run AFTER setup.sh completes

set -e
REGION="us-east-1"
BUCKET_NAME="srm-upscaler-outputs"
TABLE_NAME="SRMJobs"

echo "1. Testing S3 upload + public read..."
echo "test image content" > /tmp/test.png
aws s3 cp /tmp/test.png s3://$BUCKET_NAME/output/test-job.png
PUBLIC_URL="https://$BUCKET_NAME.s3.amazonaws.com/output/test-job.png"
echo "   Uploaded. Try opening this in a browser: $PUBLIC_URL"
curl -s -o /dev/null -w "   HTTP status: %{http_code}\n" $PUBLIC_URL

echo ""
echo "2. Testing DynamoDB put + get..."
NOW=$(date +%s)
TTL=$((NOW + 172800))  # +48h

aws dynamodb put-item --table-name $TABLE_NAME --region $REGION --item '{
  "jobId": {"S": "test-job"},
  "userId": {"S": "test-user"},
  "originalUrl": {"S": "https://example.com/test.png"},
  "processedUrl": {"S": "'"$PUBLIC_URL"'"},
  "status": {"S": "done"},
  "timestamp": {"N": "'"$NOW"'"},
  "ttl": {"N": "'"$TTL"'"}
}'

echo "   Item written. Reading it back:"
aws dynamodb get-item --table-name $TABLE_NAME --region $REGION \
  --key '{"jobId": {"S": "test-job"}}'

echo ""
echo "3. Testing GSI query (history by userId)..."
aws dynamodb query --table-name $TABLE_NAME --region $REGION \
  --index-name UserHistoryIndex \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid": {"S": "test-user"}}'

echo ""
echo "If all three steps returned data without errors, your setup is working."
echo "Clean up test item with:"
echo "  aws dynamodb delete-item --table-name $TABLE_NAME --key '{\"jobId\": {\"S\": \"test-job\"}}'"
echo "  aws s3 rm s3://$BUCKET_NAME/output/test-job.png"
