#!/bin/bash
# Update helpdesk webhook subscription filters.to to *@speakasap.com so all @speakasap.com
# inbound emails (including contact@speakasap.com) are delivered to Helpdesk.
# Run on prod: ssh statex 'cd ~/notifications-microservice && ./scripts/update-helpdesk-subscription-filter.sh'

set -e

BASE_URL="${NOTIFICATIONS_BASE_URL:-https://notifications.statex.cz}"

echo "=========================================="
echo "Update helpdesk subscription filter to *@speakasap.com"
echo "=========================================="
echo "API: $BASE_URL"
echo ""

# Get all subscriptions
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/webhooks/subscriptions" 2>/dev/null) || { echo "Failed to reach API"; exit 1; }
http_code=$(echo "$resp" | tail -n1)
body=$(echo "$resp" | sed '$d')

if [ "$http_code" != "200" ]; then
  echo "API returned HTTP $http_code"
  echo "$body"
  exit 1
fi

# Find helpdesk subscription id (array of objects with id and serviceName)
sub_id=$(echo "$body" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for s in data:
        if s.get('serviceName') == 'helpdesk':
            print(s.get('id', ''))
            break
else:
    # single object
    if data.get('serviceName') == 'helpdesk':
        print(data.get('id', ''))
" 2>/dev/null)

if [ -z "$sub_id" ]; then
  echo "No subscription with serviceName 'helpdesk' found."
  echo "Response: $body"
  exit 1
fi

echo "Found helpdesk subscription id: $sub_id"
echo "Sending PUT with filters.to = [\"*@speakasap.com\"] ..."

update_resp=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/webhooks/subscriptions/$sub_id" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"to":["*@speakasap.com"]}}' 2>/dev/null)
update_code=$(echo "$update_resp" | tail -n1)
update_body=$(echo "$update_resp" | sed '$d')

if [ "$update_code" != "200" ]; then
  echo "PUT failed with HTTP $update_code"
  echo "$update_body"
  exit 1
fi

echo "OK. Updated subscription:"
echo "$update_body" | python3 -m json.tool 2>/dev/null || echo "$update_body"
echo ""
echo "Done. All inbound emails to *@speakasap.com will be delivered to Helpdesk."
