#!/usr/bin/env bash
# Usage: ./infrastructure/cloudwatch_alarms.sh <alert-email>
# Creates (or updates) the 3 CloudWatch alarms for NomadAI + an SNS topic
# that delivers alerts to the given email address.
# Run from the repo root. Requires AWS CLI configured with the deployment account.

set -euo pipefail

ALERT_EMAIL="${1:?Usage: $0 <alert-email>}"
REGION=$(aws configure get region)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FUNCTION_NAME="nomadai"
QUEUE_NAME="nomadai-chat-jobs"
SNS_TOPIC="nomadai-alerts"

echo "==> Region:     $REGION"
echo "==> Account:    $ACCOUNT_ID"
echo "==> Alert email: $ALERT_EMAIL"
echo ""

# ── SNS topic ────────────────────────────────────────────────────────────────

echo "==> Creating SNS topic '$SNS_TOPIC'..."
SNS_ARN=$(aws sns create-topic \
  --name "$SNS_TOPIC" \
  --query TopicArn \
  --output text)
echo "    ARN: $SNS_ARN"

echo "==> Subscribing $ALERT_EMAIL to $SNS_TOPIC..."
aws sns subscribe \
  --topic-arn "$SNS_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --output text > /dev/null
echo "    ✓ Confirmation email sent — check your inbox and click the link"
echo ""

# ── Alarm 1: Lambda error count ───────────────────────────────────────────────
# Fires when >= 3 Lambda errors accumulate in a 5-minute window.
# 3 errors in 5 minutes means something is systematically broken, not just noise.

echo "==> Alarm 1: Lambda errors..."
aws cloudwatch put-metric-alarm \
  --alarm-name "nomadai-lambda-errors" \
  --alarm-description "nomadai Lambda: >= 3 errors in 5 min — investigate immediately" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=${FUNCTION_NAME}" \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 3 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_ARN" \
  --ok-actions "$SNS_ARN"
echo "    ✓ nomadai-lambda-errors"

# ── Alarm 2: Lambda average duration ─────────────────────────────────────────
# Fires when average duration exceeds 90s (Lambda timeout is 120s).
# Average at 90s means a significant portion of requests are near-timeout.

echo "==> Alarm 2: Lambda duration..."
aws cloudwatch put-metric-alarm \
  --alarm-name "nomadai-lambda-duration-high" \
  --alarm-description "nomadai Lambda: avg duration > 90s (timeout is 120s)" \
  --namespace "AWS/Lambda" \
  --metric-name "Duration" \
  --dimensions "Name=FunctionName,Value=${FUNCTION_NAME}" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 90000 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_ARN" \
  --ok-actions "$SNS_ARN"
echo "    ✓ nomadai-lambda-duration-high"

# ── Alarm 3: SQS queue backlog ────────────────────────────────────────────────
# Fires when > 50 messages are waiting in the queue.
# At normal load (< 30 req/hour/user) the queue should drain in seconds.
# A backlog means the Lambda consumer is broken or throttled.

echo "==> Alarm 3: SQS backlog..."
aws cloudwatch put-metric-alarm \
  --alarm-name "nomadai-sqs-backlog" \
  --alarm-description "nomadai SQS: > 50 messages visible — consumer may be down" \
  --namespace "AWS/SQS" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --dimensions "Name=QueueName,Value=${QUEUE_NAME}" \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "$SNS_ARN" \
  --ok-actions "$SNS_ARN"
echo "    ✓ nomadai-sqs-backlog"

echo ""
echo "==> Done. 3 alarms active."
echo "    View in console:"
echo "    https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#alarmsV2:"
echo ""
echo "    IMPORTANT: confirm the subscription email from AWS before alarms can"
echo "    deliver notifications to $ALERT_EMAIL"
