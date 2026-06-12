#!/usr/bin/env sh
set -eu

STATE_FILE="docs/IMPLEMENTATION_STATE.md"

if [ ! -f "$STATE_FILE" ]; then
  echo "Missing $STATE_FILE"
  exit 1
fi

echo "Notifications orchestrator checkpoint"
echo

awk '
  /^## Current Status/ { in_status=1; print; next }
  /^## Goal Roadmap/ { in_status=0 }
  in_status { print }
' "$STATE_FILE"

echo

awk '
  /^## Next Action/ { in_next=1; print; next }
  /^## / && in_next { exit }
  in_next { print }
' "$STATE_FILE"
