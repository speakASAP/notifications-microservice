# deploy.config.sh — declaration consumed by shared/scripts/deploy.sh.
# See shared/docs/DEPLOY_STANDARDIZATION_REPORT.md section 6/7 (Phase C) for the design.
# scripts/deploy.sh is still the live, authoritative deploy path.
#
# Note: the real script skips manifest apply entirely (build -> push -> set
# image only) — presumably manifests are assumed stable/pre-applied. The
# runner applies them anyway (default MANIFESTS); `kubectl apply` on
# unchanged manifests is a safe no-op, so this is a normalization, not a
# behavior change that can break anything.

SERVICE_NAME="notifications-microservice"
PORT="3368"

IMAGES=(
  "notifications-microservice|.||"
)

DEPLOYMENTS=(
  "notifications-microservice|app|notifications-microservice"
)
