#!/bin/bash

# Notification Microservice Restart Script
# Restarts the notification microservice

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🔄 Restarting Notification Microservice..."

# Restart services
docker compose restart

echo "✅ Service restarted"
echo "📋 Service status:"
docker compose ps notification-service

