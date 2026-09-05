# Infrastructure Quick Reference

**Namespace:** `statex-apps` | **Port:** 3368 | **Domain:** https://notifications.alfares.cz

## Kubernetes

Image: `localhost:5000/notifications-microservice:latest`  
Deploy: `scripts/deploy.sh [tag]` — builds image, pushes to local registry, runs `kubectl set image`, waits for rollout  
Health: `kubectl exec -n statex-apps deploy/notifications-microservice -- wget -q http://localhost:3368/health -O-`

Key ConfigMap values (full list: `k8s/configmap.yaml`):
- `DB_HOST`: db-server-postgres | `DB_NAME`: notifications | `DB_PORT`: 5432
- `AUTH_SERVICE_URL`: http://auth-microservice.statex-apps.svc.cluster.local:3370
- `LOGGING_SERVICE_URL`: http://logging-microservice.statex-apps.svc.cluster.local:3367
- `EMAIL_PROVIDER`: auto (AWS SES → SendGrid fallback)
- `AWS_SES_REGION`: eu-central-1 | `AWS_SES_S3_BUCKET`: speakasap-email-forward

## Vault Secrets

Path: `secret/prod/notifications-microservice`  
Synced via ExternalSecret (refresh: 5m) to K8s Secret `notifications-microservice-secret`.

## Resource Limits

CPU: 50m req / 500m limit | Memory: 128Mi req / 512Mi limit

## Operations Readiness

Run the non-destructive smoke before and after approved deployments:

```bash
./scripts/smoke-readiness.sh
```
