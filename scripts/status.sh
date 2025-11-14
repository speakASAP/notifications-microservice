#!/bin/bash

# Notification Microservice Status Script
# Checks the status of the notification microservice

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "📊 Notification Microservice Status"
echo "=================================="

# Check if container is running
if docker ps | grep -q notification-microservice; then
  echo "✅ Container is running"
else
  echo "❌ Container is not running"
  exit 1
fi

# Check health endpoint
echo ""
echo "🏥 Health Check:"
if docker exec notification-microservice wget --quiet --tries=1 --spider http://localhost:3010/health 2>/dev/null; then
  echo "✅ Health endpoint is responding"
  docker exec notification-microservice wget -qO- http://localhost:3010/health | jq . 2>/dev/null || docker exec notification-microservice wget -qO- http://localhost:3010/health
else
  echo "❌ Health endpoint is not responding"
fi

# Show container status
echo ""
echo "📋 Container Status:"
docker compose ps notification-service

# Show recent logs
echo ""
echo "📝 Recent Logs (last 20 lines):"
docker compose logs --tail=20 notification-service

