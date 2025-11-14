#!/bin/bash

# Notification Microservice Stop Script
# Stops the notification microservice

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🛑 Stopping Notification Microservice..."

# Stop services
docker compose down

echo "✅ Service stopped"

