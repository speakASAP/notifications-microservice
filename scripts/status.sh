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
if docker ps | grep -q notifications-microservice; then
  echo "✅ Container is running"
else
  echo "❌ Container is not running"
  exit 1
fi

# Load PORT from .env if available
if [ -f .env ]; then
  source .env
fi
PORT=${PORT:-3368}

# Check health endpoint
echo ""
echo "🏥 Health Check:"
if docker exec notifications-microservice wget --quiet --tries=1 --spider "http://localhost:${PORT}/health" 2>/dev/null; then
  echo "✅ Health endpoint is responding"
  docker exec notifications-microservice wget -qO- "http://localhost:${PORT}/health" | jq . 2>/dev/null || docker exec notifications-microservice wget -qO- "http://localhost:${PORT}/health"
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

