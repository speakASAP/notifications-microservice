#!/bin/bash
# Non-destructive production readiness smoke checks for notifications-microservice.
# Does not send notifications, repair inbound email, mutate webhooks, or print secret values.
set -euo pipefail

NAMESPACE="${NAMESPACE:-statex-apps}"
SERVICE_NAME="${SERVICE_NAME:-notifications-microservice}"
BASE_URL="${BASE_URL:-https://notifications.alfares.cz}"
PORT="${PORT:-3368}"
SECRET_NAME="${SECRET_NAME:-notifications-microservice-secret}"
AUTH_SECRET_NAME="${AUTH_SECRET_NAME:-auth-microservice-secret}"

failures=0

ok() { printf "OK   %s\n" "$1"; }
warn() { printf "WARN %s\n" "$1"; }
fail() { printf "FAIL %s\n" "$1"; failures=$((failures + 1)); }

http_status() {
  curl -sS -o /dev/null -w "%{http_code}" "$@"
}

check_status() {
  local label="$1"
  local expected="$2"
  shift 2
  local status
  if ! status=$(http_status "$@"); then
    fail "$label request failed"
    return
  fi
  if [ "$status" = "$expected" ]; then
    ok "$label returned HTTP $status"
  else
    fail "$label returned HTTP $status, expected $expected"
  fi
}

printf "Notifications readiness smoke\n"
printf "Namespace: %s | Service: %s | URL: %s\n" "$NAMESPACE" "$SERVICE_NAME" "$BASE_URL"

check_status "Public /health" 200 "${BASE_URL}/health"
check_status "Public /api/config" 200 "${BASE_URL}/api/config"
check_status "Unauthenticated /admin/stats rejection" 401 "${BASE_URL}/admin/stats"

if kubectl rollout status "deployment/${SERVICE_NAME}" -n "$NAMESPACE" --timeout=20s >/dev/null; then
  ok "Kubernetes rollout is complete"
else
  fail "Kubernetes rollout is not complete"
fi

pod="$(kubectl get pod -n "$NAMESPACE" -l "app=${SERVICE_NAME}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [ -z "$pod" ]; then
  fail "No pod found for app=${SERVICE_NAME}"
else
  ok "Found pod $pod"
  if kubectl exec -n "$NAMESPACE" "$pod" -- node -e "fetch('http://127.0.0.1:${PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ok "In-pod /health returned success"
  else
    fail "In-pod /health failed"
  fi
fi

token_b64="$(kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" -o jsonpath='{.data.SERVICE_TOKEN}' 2>/dev/null || true)"
if [ -z "$token_b64" ]; then
  fail "SERVICE_TOKEN is missing from $SECRET_NAME"
else
  token="$(printf '%s' "$token_b64" | base64 -d 2>/dev/null || true)"
  if [ -z "$token" ]; then
    fail "SERVICE_TOKEN could not be decoded"
  else
    ok "SERVICE_TOKEN is present for protected smoke checks"
    for endpoint in \
      "/admin/stats" \
      "/admin/history?limit=5" \
      "/admin/params" \
      "/admin/channels" \
      "/email/inbound?limit=5&listOnly=1" \
      "/email/inbound/undelivered-count" \
      "/webhooks/subscriptions"; do
      check_status "Protected ${endpoint}" 200 -H "Authorization: Bearer ${token}" "${BASE_URL}${endpoint}"
    done
  fi
fi

notifications_jwt="$(kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" -o jsonpath='{.data.JWT_SECRET}' 2>/dev/null || true)"
auth_jwt="$(kubectl get secret -n "$NAMESPACE" "$AUTH_SECRET_NAME" -o jsonpath='{.data.JWT_SECRET}' 2>/dev/null || true)"
if [ -z "$notifications_jwt" ]; then
  fail "JWT_SECRET is missing from $SECRET_NAME"
elif [ -z "$auth_jwt" ]; then
  warn "Could not read $AUTH_SECRET_NAME JWT_SECRET; verify auth/notifications JWT alignment through Vault or ExternalSecret status"
elif [ "$notifications_jwt" = "$auth_jwt" ]; then
  ok "JWT_SECRET data matches between notifications and auth Kubernetes secrets"
else
  fail "JWT_SECRET data differs between notifications and auth Kubernetes secrets"
fi

for key in AWS_SES_ACCESS_KEY_ID AWS_SES_SECRET_ACCESS_KEY DB_PASSWORD SENDGRID_API_KEY TELEGRAM_BOT_TOKEN WHATSAPP_ACCESS_TOKEN PAYMENT_API_KEY PAYMENT_APPLICATION_ID PAYMENT_WEBHOOK_API_KEY; do
  value="$(kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" -o "jsonpath={.data.${key}}" 2>/dev/null || true)"
  if [ -n "$value" ]; then
    ok "Secret key $key is present"
  else
    warn "Secret key $key is absent or empty"
  fi
done

if [ "$failures" -gt 0 ]; then
  printf "Readiness smoke failed with %s failure(s).\n" "$failures"
  exit 1
fi

printf "Readiness smoke passed.\n"
