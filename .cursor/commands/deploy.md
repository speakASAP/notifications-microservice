# Production Deployment

## Task: Deploy notifications-microservice on production

## Quick Deployment

```bash
# 1. Pull latest code
ssh statex "cd /home/statex/notifications-microservice && git pull"

# 2. Deploy service
ssh statex "cd /home/statex/notifications-microservice && ./scripts/blue-green/deploy-smart.sh notifications-microservice"

# 3. Register domain (if not exists)
ssh statex "cd /home/statex/nginx-microservice && ./scripts/blue-green/add-domain.sh notifications.alfares.cz notifications-microservice 3368 admin@alfares.cz"

# 4. Fix nginx proxy_pass if needed
ssh statex "sed -i 's|proxy_pass \$backend_api/api/;|proxy_pass \$backend_api;|' /home/statex/nginx-microservice/nginx/conf.d/notifications.alfares.cz.conf"

# 5. Copy certificate if add-domain failed
ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/notifications.alfares.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.alfares.cz/fullchain.pem > certificates/notifications.alfares.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.alfares.cz/privkey.pem > certificates/notifications.alfares.cz/privkey.pem && chmod 600 certificates/notifications.alfares.cz/privkey.pem"

# 6. Reload nginx
ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"

# 7. Verify deployment
ssh statex "curl -s https://notifications.alfares.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://notifications-microservice:3368/health"
```

## Success Criteria

- Service accessible: `https://notifications.alfares.cz/health` returns success
- Internal access: `http://notifications-microservice:3368/health` returns success
- No errors in logs: `docker compose logs logging-service | grep -i error`

## Notes

- Port: 3368
- Internal URL: `http://notifications-microservice:3368`
- External URL: `https://notifications.alfares.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/notifications-microservice.json`
- Environment: `.env` file in project root (PORT=3368)
- More details about nginx infratructure: `/home/statex/nginx-microservice/README.md`

## Deployment Plan: notifications-microservice

## Objective

Deploy notifications-microservice to production server using blue-green deployment strategy.

## Implementation Checklist

1. ✅ Pull latest code from git repository on production server
2. ✅ Deploy service using command:
'''
`ssh statex "cd /home/statex/notifications-microservice && ./scripts/blue-green/deploy-smart.sh notifications-microservice"`
'''

3. ✅ Register domain in nginx (already registered)
4. ✅ Fix nginx upstream configuration to point to actual container
5. ✅ SSL certificate already exists
6. ✅ Reload nginx configuration
7. ✅ Verify deployment by checking external and internal health endpoints

## Detailed Steps

### Step 1: Pull Latest Code

- Command: `ssh statex "cd /home/statex/notifications-microservice && git pull"`
- Purpose: Ensure production server has latest code changes

### Step 2: Deploy Service

- Command: `ssh statex "cd /home/statex/notifications-microservice && ./scripts/blue-green/deploy-smart.sh notifications-microservice"`
- Purpose: Execute blue-green deployment to minimize downtime

### Step 3: Register Domain

- Command: `ssh statex "cd /home/statex/nginx-microservice && ./scripts/blue-green/add-domain.sh notifications.alfares.cz notifications-microservice 3368 admin@alfares.cz"`
- Purpose: Configure nginx routing and SSL certificate for domain

### Step 4: Fix Nginx proxy_pass

- Command: `ssh statex "sed -i 's|proxy_pass \$backend_api/api/;|proxy_pass \$backend_api;|' /home/statex/nginx-microservice/nginx/conf.d/notifications.alfares.cz.conf"`
- Purpose: Correct proxy_pass path if it includes incorrect /api/ suffix

### Step 5: Copy SSL Certificate

- Command: `ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/notifications.alfares.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.alfares.cz/fullchain.pem > certificates/notifications.alfares.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.alfares.cz/privkey.pem > certificates/notifications.alfares.cz/privkey.pem && chmod 600 certificates/notifications.alfares.cz/privkey.pem"`
- Purpose: Ensure SSL certificates are accessible to nginx

### Step 6: Reload Nginx

- Command: `ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"`
- Purpose: Apply nginx configuration changes

### Step 7: Verify Deployment

- Command: `ssh statex "curl -s https://notifications.alfares.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://notifications-microservice:3368/health"`
- Purpose: Confirm service is accessible both externally and internally

## Success Criteria

- ✅ Service accessible: `https://notifications.alfares.cz/health` returns success
- ✅ Internal access: `http://notifications-microservice:3368/health` returns success
- ✅ No errors in logs: Verified - no errors found

## Deployment Summary

**Status**: ✅ **DEPLOYMENT SUCCESSFUL**

**Actions Completed**:

1. Pulled latest code (already up to date)
2. Deployed service using scripts/blue-green/deploy-smart.sh
3. Domain already registered in nginx
4. Fixed nginx upstream configuration to point to `notifications-microservice:3368`
5. SSL certificates verified and present
6. Nginx reloaded successfully
7. Both external and internal health checks passing

**Service Status**:

- Container: `notifications-microservice` - Running and healthy
- External URL: `https://notifications.alfares.cz/health` - ✅ Accessible
- Internal URL: `http://notifications-microservice:3368/health` - ✅ Accessible
- Port: 3368
- Network: nginx-network

## Configuration Details

- Port: 3368
- Internal URL: `http://notifications-microservice:3368`
- External URL: `https://notifications.alfares.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/notifications-microservice.json`
- Environment: `.env` file in project root (PORT=3368)
