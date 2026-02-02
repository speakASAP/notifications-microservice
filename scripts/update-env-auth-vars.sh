#!/bin/bash
# Add or ensure AUTH_SERVICE_URL and AUTH_SERVICE_PUBLIC_URL in .env (for admin panel).
# Run on prod: ssh statex "cd notifications-microservice && ./scripts/update-env-auth-vars.sh"
# Or locally: ./scripts/update-env-auth-vars.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

cd "$PROJECT_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found at $ENV_FILE"
  exit 1
fi

# Defaults: internal Docker URL for backend, public HTTPS for browser
AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-http://auth-microservice:3370}"
AUTH_SERVICE_PUBLIC_URL="${AUTH_SERVICE_PUBLIC_URL:-https://auth.statex.cz}"

added=0

if ! grep -qE '^AUTH_SERVICE_URL=' "$ENV_FILE" 2>/dev/null; then
  [ "$added" -eq 0 ] && echo "" >> "$ENV_FILE" && echo "# Auth (admin panel: JWT validation + browser login URL)" >> "$ENV_FILE"
  echo "AUTH_SERVICE_URL=$AUTH_SERVICE_URL" >> "$ENV_FILE"
  added=1
  echo "Added AUTH_SERVICE_URL to .env"
fi

if ! grep -qE '^AUTH_SERVICE_PUBLIC_URL=' "$ENV_FILE" 2>/dev/null; then
  [ "$added" -eq 0 ] && echo "" >> "$ENV_FILE" && echo "# Auth (admin panel: JWT validation + browser login URL)" >> "$ENV_FILE"
  echo "AUTH_SERVICE_PUBLIC_URL=$AUTH_SERVICE_PUBLIC_URL" >> "$ENV_FILE"
  added=1
  echo "Added AUTH_SERVICE_PUBLIC_URL to .env"
fi

if [ "$added" -eq 0 ]; then
  echo "AUTH_SERVICE_URL and AUTH_SERVICE_PUBLIC_URL already present in .env"
fi

echo "Done. Verify with: cat .env | grep AUTH_SERVICE"
