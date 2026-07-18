#!/bin/bash
set -euo pipefail
exec "$(dirname "$0")/../../shared/scripts/deploy.sh" "$(basename "$(cd "$(dirname "$0")/.." && pwd)")" "$@"
