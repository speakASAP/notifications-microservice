# Deployment

> See [`INFRA.md`](../INFRA.md) for namespace, image, Vault secret path, and ConfigMap values.

## Deploy

```bash
./scripts/deploy.sh          # builds image, pushes to registry, kubectl set image, waits for rollout
./scripts/deploy.sh v1.2.3   # deploy specific tag
```

## Verify

```bash
kubectl rollout status deploy/notifications-microservice -n statex-apps
kubectl exec -n statex-apps deploy/notifications-microservice -- wget -q http://localhost:3368/health -O-
```

## Rollback

```bash
kubectl rollout undo deployment/notifications-microservice -n statex-apps
```

## Logs

```bash
kubectl logs -n statex-apps deploy/notifications-microservice --tail=100 -f
```

## Secrets Rotation

All secrets are pulled from Vault via ExternalSecret (refresh interval: 5 min).  
To rotate a secret:
1. Update the value in Vault at `secret/prod/notifications-microservice`
2. Wait up to 5 minutes for ExternalSecret to sync, or force it:
   ```bash
   kubectl delete secret notifications-microservice-secrets -n statex-apps
   ```

## ConfigMap Updates

Edit `k8s/configmap.yaml`, then apply:
```bash
kubectl apply -f k8s/configmap.yaml
kubectl rollout restart deploy/notifications-microservice -n statex-apps
```
