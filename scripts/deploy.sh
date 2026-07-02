#!/bin/bash
# deploy.sh — Kubernetes deployment for notifications-microservice
# Usage: ./scripts/deploy.sh [image-tag]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# shellcheck disable=SC1091
source "$(dirname "$PROJECT_ROOT")/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" 2>/dev/null \
  || source "$HOME/Documents/Github/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" \
  || { echo "Error: deploy timing library not found" >&2; exit 1; }
deploy_timing_init "notifications-microservice"

SERVICE_NAME="notifications-microservice"
NAMESPACE="statex-apps"
REGISTRY="localhost:5000"
DEFAULT_TAG=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "build-$(date -u +%Y%m%d%H%M%S)")
IMAGE_TAG="${1:-$DEFAULT_TAG}"
IMAGE="${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}"
IMAGE_LATEST="${REGISTRY}/${SERVICE_NAME}:latest"
# Slim Node image has no wget/curl; health probe uses Node's fetch.
HEALTH_CHECK_PORT="${HEALTH_CHECK_PORT:-3368}"

# ═══════════════════════════════════════════════════════════
#  notifications-microservice - Kubernetes Deployment
# ═══════════════════════════════════════════════════════════

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║   Notifications Microservice - Kubernetes Deployment   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "${NODE_ENV}" = "production" ]; then
  deploy_timing_phase_start "Git sync"
  cd "$PROJECT_ROOT"
  git fetch origin && git stash && git pull origin main && git stash pop || true
  echo -e "${GREEN}✅ Git synced${NC}"
  deploy_timing_phase_end "Git sync"
fi

deploy_timing_phase_start "Build image"
docker build -t "$IMAGE" -t "$IMAGE_LATEST" "$PROJECT_ROOT"
deploy_timing_phase_end "Build image"

deploy_timing_phase_start "Push image"
docker push "$IMAGE"
docker push "$IMAGE_LATEST"
deploy_timing_phase_end "Push image"

deploy_timing_phase_start "Update K8s deployment"
kubectl set image deployment/${SERVICE_NAME} app="${IMAGE}" -n "${NAMESPACE}"
deploy_timing_phase_end "Update K8s deployment"

deploy_timing_phase_start "Wait for rollout"
deploy_timing_k8s_rollout_wait kubectl "$SERVICE_NAME" "$NAMESPACE" "180s"
deploy_timing_phase_end "Wait for rollout"

deploy_timing_phase_start "Health check"
POD=$(kubectl get pod -n "${NAMESPACE}" \
  -l app=${SERVICE_NAME} \
  -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD" ]; then
  echo -e "${RED}❌ No pod found for ${SERVICE_NAME}${NC}"
  exit 1
fi

if ! kubectl exec -n "${NAMESPACE}" "$POD" -- node -e \
  "fetch('http://127.0.0.1:${HEALTH_CHECK_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo -e "${RED}❌ Health check failed (HTTP GET /health inside pod)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Health OK${NC}"
deploy_timing_phase_end "Health check"

deploy_timing_finish_success "Notifications Microservice"
echo "Image:    ${IMAGE}"
DEPLOY_TIMING_FINISHED=1
exit 0
