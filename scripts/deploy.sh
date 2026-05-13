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

# ── Phase 1: Git sync (production only) ──────────────────────
if [ "${NODE_ENV}" = "production" ]; then
  echo -e "${YELLOW}[1/5] Syncing git...${NC}"
  cd "$PROJECT_ROOT"
  git fetch origin
  git stash
  git pull origin main
  git stash pop || true
  echo -e "${GREEN}✅ Git synced${NC}"
fi

# ── Phase 2: Build Docker image ──────────────────────────────
echo -e "${YELLOW}[2/5] Building image: ${IMAGE}...${NC}"
docker build -t "$IMAGE" -t "$IMAGE_LATEST" "$PROJECT_ROOT"
echo -e "${GREEN}✅ Image built${NC}"

# ── Phase 3: Push to local registry ──────────────────────────
echo -e "${YELLOW}[3/5] Pushing to registry...${NC}"
docker push "$IMAGE"
docker push "$IMAGE_LATEST"
echo -e "${GREEN}✅ Image pushed: ${IMAGE}${NC}"

# ── Phase 4: Update K8s deployment ──────────────────────────
echo -e "${YELLOW}[4/5] Updating K8s deployment...${NC}"
kubectl set image deployment/${SERVICE_NAME} \
  app="${IMAGE_LATEST}" \
  -n "${NAMESPACE}"
kubectl rollout status deployment/${SERVICE_NAME} \
  -n "${NAMESPACE}" \
  --timeout=180s
echo -e "${GREEN}✅ Rollout complete${NC}"

# ── Phase 5: Health check ────────────────────────────────────
echo -e "${YELLOW}[5/5] Verifying health...${NC}"
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
echo -e ""

# ── Done ─────────────────────────────────────────────────────
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ Notifications Microservice Deployment successful!  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo "Image:    ${IMAGE}"
echo "Namespace: ${NAMESPACE}"
echo "Pods:     $(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME} --no-headers | wc -l) running"
echo -e "${NC}"
