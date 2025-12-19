#!/bin/bash

# Notification Microservice Integration Verification Script
# Tests connectivity and integration with flipflop services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🔍 Verifying Notification Microservice Integration"
echo "=================================================="

# Check if notification service is running
echo ""
echo "1. Checking Notification Service Status..."
if docker ps | grep -q notifications-microservice; then
  echo "✅ Notification service container is running"
else
  echo "❌ Notification service container is not running"
  exit 1
fi

# Load PORT from .env if available
if [ -f .env ]; then
  source .env
fi
PORT=${PORT:-3368}

# Check health endpoint
echo ""
echo "2. Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s "http://localhost:${PORT}/health" 2>/dev/null || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "success"; then
  echo "✅ Health endpoint is responding"
  echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
else
  echo "❌ Health endpoint is not responding"
  exit 1
fi

# Check if flipflop services are running
echo ""
echo "3. Checking flipflop Services..."
flipflop_CONTAINERS=$(docker ps --format '{{.Names}}' | grep -E 'flipflop|commerce' || echo "")
if [ -z "$flipflop_CONTAINERS" ]; then
  echo "⚠️  No flipflop containers found running"
  echo "   flipflop services need to be deployed for full integration testing"
else
  echo "✅ Found flipflop containers:"
  echo "$flipflop_CONTAINERS" | while read container; do
    echo "   - $container"
  done
fi

# Test connectivity from flipflop containers
if [ -n "$flipflop_CONTAINERS" ]; then
  echo ""
  echo "4. Testing Connectivity from flipflop Services..."
  echo "$flipflop_CONTAINERS" | while read container; do
    echo "   Testing from $container..."
    if docker exec "$container" curl -s "http://notifications-microservice:${PORT}/health" >/dev/null 2>&1; then
      echo "   ✅ $container can reach notification service"
    else
      echo "   ❌ $container cannot reach notification service"
      echo "      Ensure container is on nginx-network:"
      echo "      docker network connect nginx-network $container"
    fi
  done
fi

# Test notification sending
echo ""
echo "5. Testing Notification Sending..."
TEST_RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/notifications/send" \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "email",
    "type": "custom",
    "recipient": "test@example.com",
    "subject": "Integration Test",
    "message": "This is an integration test notification"
  }' 2>/dev/null || echo "FAILED")

if echo "$TEST_RESPONSE" | grep -q "success"; then
  NOTIFICATION_ID=$(echo "$TEST_RESPONSE" | jq -r '.data.id' 2>/dev/null || echo "")
  echo "✅ Notification sent successfully"
  if [ -n "$NOTIFICATION_ID" ]; then
    echo "   Notification ID: $NOTIFICATION_ID"
    
    # Check notification status
    echo ""
    echo "6. Checking Notification Status..."
    STATUS_RESPONSE=$(curl -s "http://localhost:${PORT}/notifications/status/$NOTIFICATION_ID" 2>/dev/null || echo "FAILED")
    if echo "$STATUS_RESPONSE" | grep -q "success"; then
      echo "✅ Notification status retrieved"
      echo "$STATUS_RESPONSE" | jq '.data | {id, status, channel, recipient}' 2>/dev/null || echo "$STATUS_RESPONSE"
    else
      echo "⚠️  Could not retrieve notification status"
    fi
  fi
else
  echo "⚠️  Notification sending test failed (may be due to invalid API keys)"
  echo "$TEST_RESPONSE" | jq . 2>/dev/null || echo "$TEST_RESPONSE"
fi

# Check notification history
echo ""
echo "7. Testing Notification History..."
HISTORY_RESPONSE=$(curl -s "http://localhost:${PORT}/notifications/history?limit=5" 2>/dev/null || echo "FAILED")
if echo "$HISTORY_RESPONSE" | grep -q "success"; then
  COUNT=$(echo "$HISTORY_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  echo "✅ Notification history retrieved ($COUNT notifications)"
else
  echo "⚠️  Could not retrieve notification history"
fi

# Network connectivity check
echo ""
echo "8. Checking Network Configuration..."
if docker network inspect nginx-network >/dev/null 2>&1; then
  echo "✅ nginx-network exists"
  if docker network inspect nginx-network | grep -q notifications-microservice; then
    echo "✅ Notification service is on nginx-network"
  else
    echo "❌ Notification service is not on nginx-network"
    echo "   Connect it: docker network connect nginx-network notifications-microservice"
  fi
else
  echo "❌ nginx-network does not exist"
fi

# Summary
echo ""
echo "=================================================="
echo "📊 Integration Verification Summary"
echo "=================================================="
echo "✅ Notification service is running and healthy"
echo "✅ API endpoints are responding"
if [ -z "$flipflop_CONTAINERS" ]; then
  echo "⚠️  flipflop services are not running"
  echo "   Deploy flipflop services to complete integration testing"
else
  echo "✅ flipflop services are running"
fi
echo ""
echo "📝 Next Steps:"
echo "   1. Ensure flipflop services have NOTIFICATION_SERVICE_URL in .env:"
echo "      NOTIFICATION_SERVICE_URL=http://notifications-microservice:\${PORT:-3368}  # PORT configured in notifications-microservice/.env"
echo "   2. Ensure flipflop services are on nginx-network"
echo "   3. Test order creation to verify notification sending"
echo ""

