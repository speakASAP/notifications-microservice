#!/bin/bash
# Test Telegram Notification Service
# Usage: ./scripts/test-telegram.sh [chat_id] [bot_token]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values from .env or use provided
CHAT_ID="${1:-${TELEGRAM_CHAT_ID:-694579866}}"
BOT_TOKEN="${2:-${TELEGRAM_BOT_TOKEN:-}}"
SERVICE_URL="${NOTIFICATION_SERVICE_URL:-https://notifications.statex.cz}"

echo "🧪 Testing Telegram Notification Service"
echo "=========================================="
echo "Service URL: $SERVICE_URL"
echo "Chat ID: $CHAT_ID"
echo "Using bot token: ${BOT_TOKEN:+Yes (provided)}${BOT_TOKEN:-No (using global)}"
echo ""

# Test 1: Basic Telegram notification
echo "Test 1: Basic Telegram notification"
echo "-----------------------------------"
BASIC_PAYLOAD=$(cat <<EOF
{
  "channel": "telegram",
  "type": "custom",
  "recipient": "$CHAT_ID",
  "message": "🧪 Test message from notification-microservice - Basic test"
}
EOF
)

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$SERVICE_URL/notifications/send" \
  -H "Content-Type: application/json" \
  -d "$BASIC_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Test 1 PASSED (HTTP $HTTP_CODE)"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Test 1 FAILED (HTTP $HTTP_CODE)"
  echo "$BODY"
fi
echo ""

# Test 2: Telegram with inline keyboard
echo "Test 2: Telegram notification with inline keyboard"
echo "--------------------------------------------------"
KEYBOARD_PAYLOAD=$(cat <<EOF
{
  "channel": "telegram",
  "type": "custom",
  "recipient": "$CHAT_ID",
  "message": "🧪 Test message with inline keyboard buttons",
  "inlineKeyboard": [
    [
      {
        "text": "📊 View Dashboard",
        "url": "https://statex.ai/dashboard"
      }
    ],
    [
      {
        "text": "🤖 Test Button",
        "url": "https://statex.ai"
      }
    ]
  ]
}
EOF
)

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$SERVICE_URL/notifications/send" \
  -H "Content-Type: application/json" \
  -d "$KEYBOARD_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Test 2 PASSED (HTTP $HTTP_CODE)"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Test 2 FAILED (HTTP $HTTP_CODE)"
  echo "$BODY"
fi
echo ""

# Test 3: Telegram with per-request bot token (if provided)
if [ -n "$BOT_TOKEN" ]; then
  echo "Test 3: Telegram with per-request bot token"
  echo "-------------------------------------------"
  TOKEN_PAYLOAD=$(cat <<EOF
{
  "channel": "telegram",
  "type": "custom",
  "recipient": "$CHAT_ID",
  "message": "🧪 Test message with per-request bot token",
  "botToken": "$BOT_TOKEN"
}
EOF
)

  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$SERVICE_URL/notifications/send" \
    -H "Content-Type: application/json" \
    -d "$TOKEN_PAYLOAD")

  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Test 3 PASSED (HTTP $HTTP_CODE)"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo "❌ Test 3 FAILED (HTTP $HTTP_CODE)"
    echo "$BODY"
  fi
  echo ""
fi

# Test 4: Health check
echo "Test 4: Health check"
echo "--------------------"
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$SERVICE_URL/health")
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Health check PASSED (HTTP $HEALTH_HTTP_CODE)"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
  echo "❌ Health check FAILED (HTTP $HEALTH_HTTP_CODE)"
  echo "$HEALTH_BODY"
fi
echo ""

echo "=========================================="
echo "✅ Testing complete!"
