#!/bin/bash
# Non-destructive invoice document delivery readiness check.
# Uses POST /notifications/validate only: no notification row, provider call, channel mutation, or customer contact.
set -euo pipefail

NAMESPACE="${NAMESPACE:-statex-apps}"
SECRET_NAME="${SECRET_NAME:-notifications-microservice-secret}"
BASE_URL="${BASE_URL:-https://notifications.alfares.cz}"
CHANNEL_KEY="${INVOICES_NOTIFICATION_CHANNEL_KEY:-invoices.documents}"
RECIPIENT="${INVOICES_SMOKE_RECIPIENT:-invoice-smoke@example.invalid}"
SERVICE_NAME="invoices-microservice"
PURPOSE="transactional"

failures=0
ok() { printf "OK   %s\n" "$1"; }
fail() { printf "FAIL %s\n" "$1"; failures=$((failures + 1)); }

read_secret_key() {
  local key="$1"
  kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" -o "jsonpath={.data.${key}}" 2>/dev/null | base64 -d 2>/dev/null || true
}

validate_invoice_payload() {
  local invoice_type="$1"
  local notification_type="$2"
  local label="$3"
  local number="$4"
  local body_file
  local response_file
  local status

  body_file="/tmp/notifications-invoices-${invoice_type}-payload.$$"
  response_file="/tmp/notifications-invoices-${invoice_type}-response.$$"
  cat > "$body_file" <<JSON
{
  "channel": "email",
  "type": "${notification_type}",
  "recipient": "${RECIPIENT}",
  "subject": "${label} ${number}",
  "message": "${label} ${number} is ready: https://invoices.alfares.cz/documents/example.html?token=example",
  "service": "${SERVICE_NAME}",
  "purpose": "${PURPOSE}",
  "channelKey": "${CHANNEL_KEY}",
  "templateData": {
    "invoice": {
      "id": "invoice-smoke-${invoice_type}",
      "type": "${invoice_type}",
      "invoiceNumber": "${number}",
      "orderId": "order-smoke"
    }
  }
}
JSON

  status=$(curl -sS -o "$response_file" -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data-binary "@${body_file}" \
    "${BASE_URL}/notifications/validate" || true)

  rm -f "$body_file"
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    if grep -q '"mutation":false' "$response_file" && grep -q '"providerCall":false' "$response_file"; then
      ok "${invoice_type} validate returned HTTP ${status} with mutation=false and providerCall=false"
    else
      fail "${invoice_type} validate returned HTTP ${status} but no-send flags were not present"
      sed -n '1,8p' "$response_file"
    fi
  else
    fail "${invoice_type} validate returned HTTP ${status}; expected 200 or 201"
    sed -n '1,8p' "$response_file"
  fi
  rm -f "$response_file"
}

printf "Invoices documents notification readiness check\n"
printf "Namespace: %s | Secret: %s | URL: %s | Channel: %s\n" "$NAMESPACE" "$SECRET_NAME" "$BASE_URL" "$CHANNEL_KEY"

token="$(read_secret_key INVOICES_NOTIFICATIONS_SERVICE_TOKEN)"
if [ -z "$token" ]; then
  fail "INVOICES_NOTIFICATIONS_SERVICE_TOKEN is missing from ${SECRET_NAME}"
else
  ok "INVOICES_NOTIFICATIONS_SERVICE_TOKEN is present for no-send validate checks"
  validate_invoice_payload "proforma" "order_confirmation" "Proforma invoice" "PF-2026-0001"
  validate_invoice_payload "final" "payment_confirmation" "Final tax invoice" "FV-2026-0001"
fi

if [ "$failures" -gt 0 ]; then
  printf "Invoices documents readiness check failed with %s failure(s).\n" "$failures"
  exit 1
fi

printf "Invoices documents readiness check passed.\n"
