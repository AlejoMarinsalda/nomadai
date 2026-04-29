#!/usr/bin/env bash
# Creates all AWS resources for the dev environment.
# Run once before pushing to the develop branch for the first time.
# Requires: AWS CLI configured, nomadai-lambda-role already exists (created for prod),
#           nomadai ECR repository already exists.
#
# Dev resources use the "-dev" suffix to keep them completely isolated from prod.

set -euo pipefail

REGION=$(aws configure get region)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ENV="dev"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/nomadai-lambda-role"
ECR_IMAGE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/nomadai:dev"

echo "==> Region:  $REGION"
echo "==> Account: $ACCOUNT_ID"
echo "==> Env:     $ENV"
echo ""

# ── DynamoDB: nomadai-profiles-dev ───────────────────────────────────────────
echo "==> DynamoDB: nomadai-profiles-dev"
aws dynamodb create-table \
  --table-name "nomadai-profiles-dev" \
  --attribute-definitions AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --output text > /dev/null 2>&1 && echo "    ✓ Created" || echo "    (already exists)"

# ── DynamoDB: nomadai-jobs-dev ────────────────────────────────────────────────
echo "==> DynamoDB: nomadai-jobs-dev"
aws dynamodb create-table \
  --table-name "nomadai-jobs-dev" \
  --attribute-definitions AttributeName=job_id,AttributeType=S \
  --key-schema AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --output text > /dev/null 2>&1 && echo "    ✓ Created" || echo "    (already exists)"

aws dynamodb update-time-to-live \
  --table-name "nomadai-jobs-dev" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" > /dev/null 2>&1 || true

# ── DynamoDB: nomadai-rate-limits-dev ────────────────────────────────────────
echo "==> DynamoDB: nomadai-rate-limits-dev"
aws dynamodb create-table \
  --table-name "nomadai-rate-limits-dev" \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=window,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
    AttributeName=window,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --output text > /dev/null 2>&1 && echo "    ✓ Created" || echo "    (already exists)"

aws dynamodb update-time-to-live \
  --table-name "nomadai-rate-limits-dev" \
  --time-to-live-specification "Enabled=true,AttributeName=expires_at" > /dev/null 2>&1 || true

# ── DynamoDB: nomadai-checkpoints-dev (schema copiado de prod) ───────────────
echo "==> DynamoDB: nomadai-checkpoints-dev"
ATTR_DEFS=$(aws dynamodb describe-table --table-name nomadai-checkpoints \
  --query 'Table.AttributeDefinitions' --output json)
KEY_SCHEMA=$(aws dynamodb describe-table --table-name nomadai-checkpoints \
  --query 'Table.KeySchema' --output json)

aws dynamodb create-table \
  --table-name "nomadai-checkpoints-dev" \
  --attribute-definitions "$ATTR_DEFS" \
  --key-schema "$KEY_SCHEMA" \
  --billing-mode PAY_PER_REQUEST \
  --output text > /dev/null 2>&1 && echo "    ✓ Created" || echo "    (already exists)"

# ── S3: nomadai-checkpoints-offload-dev ──────────────────────────────────────
echo "==> S3: nomadai-checkpoints-offload-dev"
aws s3 mb "s3://nomadai-checkpoints-offload-dev" --region "$REGION" \
  2>&1 | grep -v "BucketAlreadyOwnedByYou" || true
echo "    ✓ Done"

# ── SQS: nomadai-chat-jobs-dev + DLQ ─────────────────────────────────────────
echo "==> SQS: nomadai-chat-jobs-dlq-dev"
DLQ_URL=$(aws sqs create-queue \
  --queue-name "nomadai-chat-jobs-dlq-dev" \
  --attributes MessageRetentionPeriod=1209600 \
  --query QueueUrl --output text 2>/dev/null || \
  aws sqs get-queue-url --queue-name "nomadai-chat-jobs-dlq-dev" --query QueueUrl --output text)

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)
echo "    ✓ $DLQ_ARN"

echo "==> SQS: nomadai-chat-jobs-dev"
QUEUE_URL=$(aws sqs create-queue \
  --queue-name "nomadai-chat-jobs-dev" \
  --attributes "VisibilityTimeout=300,RedrivePolicy={\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"3\"}" \
  --query QueueUrl --output text 2>/dev/null || \
  aws sqs get-queue-url --queue-name "nomadai-chat-jobs-dev" --query QueueUrl --output text)
echo "    ✓ $QUEUE_URL"

# ── IAM: permisos adicionales para tablas -dev ────────────────────────────────
echo "==> IAM: adding dev table permissions to nomadai-lambda-role..."
aws iam put-role-policy \
  --role-name nomadai-lambda-role \
  --policy-name nomadai-dev-resources \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:DeleteItem\",\"dynamodb:UpdateItem\",\"dynamodb:Query\",\"dynamodb:Scan\"],
        \"Resource\": [
          \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/nomadai-profiles-dev\",
          \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/nomadai-jobs-dev\",
          \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/nomadai-rate-limits-dev\",
          \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/nomadai-checkpoints-dev\",
          \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/nomadai-checkpoints-dev/index/*\"
        ]
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"sqs:SendMessage\",\"sqs:ReceiveMessage\",\"sqs:DeleteMessage\",\"sqs:GetQueueAttributes\"],
        \"Resource\": \"arn:aws:sqs:${REGION}:${ACCOUNT_ID}:nomadai-chat-jobs-dev\"
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\"],
        \"Resource\": [
          \"arn:aws:s3:::nomadai-checkpoints-offload-dev\",
          \"arn:aws:s3:::nomadai-checkpoints-offload-dev/*\"
        ]
      }
    ]
  }"
echo "    ✓ Permissions added"

# ── Lambda: nomadai-dev ───────────────────────────────────────────────────────
echo ""
echo "==> Lambda: nomadai-dev"
echo "    Note: requires the 'dev' ECR image to exist."
echo "    If this is the first setup, push to the develop branch first to build the image,"
echo "    then re-run this section or create the Lambda manually."
echo ""

# Check if dev ECR image exists
if aws ecr describe-images \
    --repository-name nomadai \
    --image-ids imageTag=dev \
    --output text > /dev/null 2>&1; then

  if aws lambda get-function --function-name nomadai-dev > /dev/null 2>&1; then
    echo "    Lambda nomadai-dev already exists — skipping creation."
  else
    echo "    Creating Lambda nomadai-dev..."
    aws lambda create-function \
      --function-name nomadai-dev \
      --package-type Image \
      --code "ImageUri=${ECR_IMAGE}" \
      --role "$ROLE_ARN" \
      --timeout 120 \
      --memory-size 1024 \
      --environment "Variables={
        PROFILES_TABLE=nomadai-profiles-dev,
        JOBS_TABLE=nomadai-jobs-dev,
        CHECKPOINTS_TABLE=nomadai-checkpoints-dev,
        CHECKPOINTS_S3_BUCKET=nomadai-checkpoints-offload-dev,
        RATE_LIMIT_TABLE=nomadai-rate-limits-dev,
        SQS_QUEUE_URL=${QUEUE_URL},
        GOOGLE_API_KEY=REPLACE_ME,
        TAVILY_API_KEY=REPLACE_ME,
        YOUTUBE_API_KEY=REPLACE_ME,
        GOOGLE_CLIENT_ID=REPLACE_ME,
        GOOGLE_MODEL_ID=gemini-2.0-flash,
        LOG_LEVEL=DEBUG
      }" \
      --output text > /dev/null
    echo "    ✓ Created — update env vars with real API keys:"
    echo "    aws lambda update-function-configuration --function-name nomadai-dev --environment ..."

    # Function URL
    aws lambda create-function-url-config \
      --function-name nomadai-dev \
      --auth-type NONE \
      --output text > /dev/null

    aws lambda add-permission \
      --function-name nomadai-dev \
      --statement-id FunctionURLAllowPublicAccess \
      --action lambda:InvokeFunctionUrl \
      --principal "*" \
      --function-url-auth-type NONE \
      --output text > /dev/null

    DEV_URL=$(aws lambda get-function-url-config \
      --function-name nomadai-dev \
      --query FunctionUrl --output text)
    echo "    ✓ Dev URL: $DEV_URL"
  fi
else
  echo "    ECR image 'nomadai:dev' not found yet."
  echo "    1. Push to the develop branch to build and push the image"
  echo "    2. Re-run this script to create the Lambda function"
fi

echo ""
echo "==> Dev environment ready."
echo "    Push to 'develop' branch → GitHub Actions deploys to nomadai-dev Lambda"
echo "    Push to 'main' branch    → GitHub Actions deploys to nomadai Lambda (prod)"
