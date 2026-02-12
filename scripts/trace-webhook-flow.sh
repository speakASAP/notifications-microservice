#!/bin/bash
# Print recent log lines for the inbound-email → webhook delivery flow to find where it hangs.
# Run on statex: ssh statex 'cd ~/notifications-microservice && ./scripts/trace-webhook-flow.sh'
# Optional: LINES=500 ./scripts/trace-webhook-flow.sh

set -e

LINES="${LINES:-300}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.blue.yml}"
SERVICE_NAME="${NOTIFICATION_SERVICE_NAME:-notification-service}"

echo "=========================================="
echo "Trace webhook flow (last $LINES log lines)"
echo "=========================================="
echo ""

if ! command -v docker &>/dev/null; then
  echo "Docker not found. Run this script on the host where notification-service runs (e.g. statex)."
  exit 1
fi

# Try to get logs (container name may vary)
if docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "$SERVICE_NAME"; then
  LOGS=$(docker compose -f "$COMPOSE_FILE" logs --tail="$LINES" "$SERVICE_NAME" 2>&1)
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q notifications; then
  CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 notifications)
  LOGS=$(docker logs --tail="$LINES" "$CONTAINER" 2>&1)
else
  echo "Could not find notification-service container. Set COMPOSE_FILE and NOTIFICATION_SERVICE_NAME if needed."
  exit 1
fi

echo "--- Flow: CONTROLLER (email received) → PROCESS → WEBHOOK_DELIVERY (POST to helpdesk) ---"
echo ""
echo "$LOGS" | grep -E '\[CONTROLLER\].*INBOUND|\[SERVICE\].*HANDLE SES|\[SERVICE\].*processInboundEmail|\[SERVICE\].*Processed inbound|\[WEBHOOK_DELIVERY\]' | tail -80
echo ""
echo "--- If you see 'Sending HTTP POST request' but NOT 'HTTP request completed' or 'Successfully delivered', the hang is the POST to the portal (timeout/network). ---"
echo "--- See docs/TRACE_WEBHOOK_HANG.md for full steps and portal/Celery checks. ---"
