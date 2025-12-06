# Production Deployment Guide

This guide covers the complete production deployment process for the notifications-microservice.

## Prerequisites

- Access to production server via SSH (`ssh statex`)
- Docker and Docker Compose installed on production server
- Nginx microservice configured and running
- PostgreSQL database accessible on `nginx-network`

## Production Environment

- **Server**: Production server (accessible via `ssh statex`)
- **Service Path**: `/home/statex/notifications-microservice`
- **Container Name**: `notifications-microservice`
- **Port**: `${PORT:-3368}` (configured in `notifications-microservice/.env`)
- **Network**: `nginx-network` (Docker network)
- **External URL**: `https://notifications.statex.cz`
- **Internal URL**: `http://notifications-microservice:${PORT:-3368}` (port configured in `notifications-microservice/.env`)

## Deployment Steps

### 1. Pull Latest Code

```bash
ssh statex "cd /home/statex/notifications-microservice && git pull origin main"
```

### 2. Deploy Service

The deployment script will:

- Build the Docker image
- Start the container
- Wait for health checks
- Verify service is running

```bash
ssh statex "cd /home/statex/notifications-microservice && ./scripts/deploy.sh"
```

### 3. Register Domain in Nginx

If the domain is not already registered:

```bash
ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh notifications.statex.cz notifications-microservice \${PORT:-3368} admin@statex.cz"  # PORT configured in notifications-microservice/.env
```

This script will:

- Create nginx configuration file
- Set up SSL certificate via Let's Encrypt
- Configure upstream to point to the service

### 4. Update Nginx Configuration (if needed)

If the nginx configuration needs manual adjustment:

```bash
# Fix proxy_pass if it has incorrect path
ssh statex "sed -i 's|proxy_pass \$backend_api/api/;|proxy_pass \$backend_api;|' /home/statex/nginx-microservice/nginx/conf.d/notifications.statex.cz.conf"
```

### 5. Copy SSL Certificate (if add-domain failed)

If the certificate wasn't automatically copied:

```bash
ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/notifications.statex.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/fullchain.pem > certificates/notifications.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/privkey.pem > certificates/notifications.statex.cz/privkey.pem && chmod 600 certificates/notifications.statex.cz/privkey.pem"
```

### 6. Reload Nginx

After configuration changes:

```bash
ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"
```

### 7. Verify Deployment

Check both external and internal access:

```bash
# External HTTPS access
ssh statex "curl -s https://notifications.statex.cz/health"

# Internal Docker network access
# Port configured in notifications-microservice/.env: PORT (default: 3368)
ssh statex "docker run --rm --network nginx-network alpine/curl:latest curl -s http://notifications-microservice:\${PORT:-3368}/health"
```

Expected response:

```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "notifications-microservice"
}
```

## Network Configuration

The service must be connected to the `nginx-network` Docker network for internal communication:

```bash
# Check if connected
ssh statex "docker network inspect nginx-network | grep notifications-microservice"

# Connect if not already connected
ssh statex "docker network connect nginx-network notifications-microservice"
```

## Environment Variables

Production environment variables are stored in `/home/statex/notifications-microservice/.env`:

```bash
# View environment variables (without exposing secrets)
ssh statex "cd /home/statex/notifications-microservice && cat .env | grep -v PASSWORD | grep -v TOKEN | grep -v KEY"
```

Key variables:

- `PORT=3368` - Service port (configured in `notifications-microservice/.env`, default: 3368)
- `NODE_ENV=production` - Environment mode
- `DB_HOST=db-server-postgres` - Database host
- `LOGGING_SERVICE_URL=http://logging-microservice:3367` - Logging service URL

## Troubleshooting

### Service Not Starting

1. Check container logs:

   ```bash
   ssh statex "docker logs notifications-microservice"
   ```

2. Check service status:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && ./scripts/status.sh"
   ```

3. Verify port availability:

   ```bash
   # Port configured in notifications-microservice/.env: PORT (default: 3368)
   ssh statex "lsof -i :\${PORT:-3368}"
   ```

### Nginx Configuration Issues

1. Test nginx configuration:

   ```bash
   ssh statex "docker exec nginx-microservice nginx -t"
   ```

2. Check nginx error logs:

   ```bash
   ssh statex "docker logs nginx-microservice | tail -50"
   ```

3. Verify upstream connectivity:

   ```bash
   # Port configured in notifications-microservice/.env: PORT (default: 3368)
   ssh statex "docker exec nginx-microservice curl -s http://notifications-microservice:\${PORT:-3368}/health"
   ```

### SSL Certificate Issues

1. Check certificate existence:

   ```bash
   ssh statex "docker exec nginx-certbot ls -la /etc/letsencrypt/live/notifications.statex.cz/"
   ```

2. Request new certificate:

   ```bash
   ssh statex "docker exec nginx-certbot certbot certonly --webroot -w /var/www/html -d notifications.statex.cz --email admin@statex.cz --agree-tos --no-eff-email --non-interactive"
   ```

3. Copy certificate:

   ```bash
   ssh statex "cd /home/statex/nginx-microservice && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/fullchain.pem > certificates/notifications.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/privkey.pem > certificates/notifications.statex.cz/privkey.pem && chmod 600 certificates/notifications.statex.cz/privkey.pem"
   ```

### Old Container Conflicts

If the old `notification-microservice` (singular) container is still running:

```bash
# Stop and remove old container
ssh statex "docker stop notification-microservice && docker rm notification-microservice"

# Remove old images (optional)
ssh statex "docker rmi notification-microservice-notification-service 2>/dev/null || true"
```

## Health Checks

The service includes a health check endpoint that Docker monitors:

- **Endpoint**: `GET /health`
- **Docker Health Check**: Configured in `docker-compose.yml`
- **Interval**: Every 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3

Check health status:

```bash
ssh statex "docker ps | grep notifications-microservice"
```

Look for `(healthy)` status in the output.

## Monitoring

### Service Logs

```bash
# View real-time logs
ssh statex "docker logs -f notifications-microservice"

# View last 100 lines
ssh statex "docker logs --tail 100 notifications-microservice"
```

### Service Status

```bash
ssh statex "cd /home/statex/notifications-microservice && ./scripts/status.sh"
```

## Rollback

If deployment fails, you can rollback to a previous version:

1. Stop current container:

   ```bash
   ssh statex "docker stop notifications-microservice"
   ```

2. Checkout previous version:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && git log --oneline -10"
   ssh statex "cd /home/statex/notifications-microservice && git checkout <previous-commit-hash>"
   ```

3. Redeploy:

   ```bash
   ssh statex "cd /home/statex/notifications-microservice && ./scripts/deploy.sh"
   ```

## Success Criteria

Deployment is successful when:

- ✅ Service accessible: `https://notifications.statex.cz/health` returns success
- ✅ Internal access: `http://notifications-microservice:${PORT:-3368}/health` returns success (port configured in `notifications-microservice/.env`)
- ✅ Container status: `docker ps` shows `(healthy)` status
- ✅ No errors in logs: `docker logs notifications-microservice | grep -i error`
- ✅ Nginx configuration valid: `docker exec nginx-microservice nginx -t` succeeds
- ✅ SSL certificate valid: HTTPS connection works without warnings

## Additional Resources

- Service repository: `/home/statex/notifications-microservice`
- Nginx configuration: `/home/statex/nginx-microservice/nginx/conf.d/notifications.statex.cz.conf`
- Service registry: `/home/statex/nginx-microservice/service-registry/notifications-microservice.json`
- Environment file: `/home/statex/notifications-microservice/.env`
