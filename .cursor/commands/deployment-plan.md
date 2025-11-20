# Deployment Plan: notifications-microservice

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

- Command: `ssh statex "cd /home/statex/nginx-microservice && ./scripts/blue-green/add-domain.sh notifications.statex.cz notifications-microservice 3368 admin@statex.cz"`
- Purpose: Configure nginx routing and SSL certificate for domain

### Step 4: Fix Nginx proxy_pass

- Command: `ssh statex "sed -i 's|proxy_pass \$backend_api/api/;|proxy_pass \$backend_api;|' /home/statex/nginx-microservice/nginx/conf.d/notifications.statex.cz.conf"`
- Purpose: Correct proxy_pass path if it includes incorrect /api/ suffix

### Step 5: Copy SSL Certificate

- Command: `ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/notifications.statex.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/fullchain.pem > certificates/notifications.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/privkey.pem > certificates/notifications.statex.cz/privkey.pem && chmod 600 certificates/notifications.statex.cz/privkey.pem"`
- Purpose: Ensure SSL certificates are accessible to nginx

### Step 6: Reload Nginx

- Command: `ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"`
- Purpose: Apply nginx configuration changes

### Step 7: Verify Deployment

- Command: `ssh statex "curl -s https://notifications.statex.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://notifications-microservice:3368/health"`
- Purpose: Confirm service is accessible both externally and internally

## Success Criteria

- ✅ Service accessible: `https://notifications.statex.cz/health` returns success
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
- External URL: `https://notifications.statex.cz/health` - ✅ Accessible
- Internal URL: `http://notifications-microservice:3368/health` - ✅ Accessible
- Port: 3368
- Network: nginx-network

## Configuration Details

- Port: 3368
- Internal URL: `http://notifications-microservice:3368`
- External URL: `https://notifications.statex.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/notifications-microservice.json`
- Environment: `.env` file in project root (PORT=3368)
