#!/usr/bin/env bash
# Creates the Dead Letter Queue for nomadai-chat-jobs and wires up the
# redrive policy (3 retries before moving to DLQ).
# Also adds a CloudWatch alarm that fires when any message lands in the DLQ.
#
# Run once from the repo root. Requires AWS CLI configured with the deployment
# account. The nomadai-alerts SNS topic must already exist (run cloudwatch_alarms.sh first).

set -euo pipefail

REGION=$(aws configure get region)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
SOURCE_QUEUE="nomadai-chat-jobs"
DLQ_NAME="nomadai-chat-jobs-dlq"
MAX_RECEIVE_COUNT=3
SNS_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:nomadai-alerts"

echo "==> Region:  $REGION"
echo "==> Account: $ACCOUNT_ID"
echo ""

# ── 1. Crear DLQ ─────────────────────────────────────────────────────────────
echo "==> Creating DLQ '$DLQ_NAME'..."
DLQ_URL=$(aws sqs create-queue \
  --queue-name "$DLQ_NAME" \
  --attributes MessageRetentionPeriod=1209600 \
  --query QueueUrl --output text)
echo "    URL: $DLQ_URL"

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query "Attributes.QueueArn" --output text)
echo "    ARN: $DLQ_ARN"

# ── 2. Configurar redrive policy en la cola principal ──────────────────────────
echo ""
echo "==> Configuring redrive policy on '$SOURCE_QUEUE' (maxReceiveCount=$MAX_RECEIVE_COUNT)..."
SOURCE_URL=$(aws sqs get-queue-url \
  --queue-name "$SOURCE_QUEUE" \
  --query QueueUrl --output text)

REDRIVE_POLICY=$(printf '{"deadLetterTargetArn":"%s","maxReceiveCount":"%d"}' "$DLQ_ARN" "$MAX_RECEIVE_COUNT")

aws sqs set-queue-attributes \
  --queue-url "$SOURCE_URL" \
  --attributes "RedrivePolicy=${REDRIVE_POLICY}"
echo "    ✓ After $MAX_RECEIVE_COUNT failed attempts, messages move to $DLQ_NAME"

# ── 3. Alarma: cualquier mensaje en la DLQ = problema ─────────────────────────
echo ""
echo "==> Adding CloudWatch alarm for DLQ messages..."
aws cloudwatch put-metric-alarm \
  --alarm-name "nomadai-dlq-messages" \
  --alarm-description "nomadai DLQ: >= 1 message — a job failed 3 times, needs investigation" \
  --namespace "AWS/SQS" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --dimensions "Name=QueueName,Value=${DLQ_NAME}" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_ARN"
echo "    ✓ nomadai-dlq-messages"

echo ""
echo "==> Done."
echo "    DLQ URL: $DLQ_URL"
echo "    Inspect failed messages:"
echo "    aws sqs receive-message --queue-url $DLQ_URL --max-number-of-messages 10"
