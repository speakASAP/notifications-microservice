#!/bin/bash

# Notification Microservice Start Script
# Starts the notification microservice

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🚀 Starting Notification Microservice..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "Please create .env file from .env.example"
  exit 1
fi

# Start services
docker compose up -d

echo "✅ Service started"
echo "📋 Service status:"
docker compose ps notification-service

