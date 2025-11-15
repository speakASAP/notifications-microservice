# Production Deployment

## Task: Deploy notifications-microservice on production

## Quick Deployment

```bash
# 1. Pull latest code
ssh statex "cd /home/statex/notifications-microservice && git pull origin master"

# 2. Deploy service
ssh statex "cd /home/statex/notifications-microservice && ./scripts/deploy.sh"

# 3. Register domain (if not exists)
ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh notifications.statex.cz notifications-microservice 3368 admin@statex.cz"

# 4. Fix nginx proxy_pass if needed
ssh statex "sed -i 's|proxy_pass \$backend_api/api/;|proxy_pass \$backend_api;|' /home/statex/nginx-microservice/nginx/conf.d/notifications.statex.cz.conf"

# 5. Copy certificate if add-domain failed
ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/notifications.statex.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/fullchain.pem > certificates/notifications.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/notifications.statex.cz/privkey.pem > certificates/notifications.statex.cz/privkey.pem && chmod 600 certificates/notifications.statex.cz/privkey.pem"

# 6. Reload nginx
ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"

# 7. Verify deployment
ssh statex "curl -s https://notifications.statex.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://notifications-microservice:3368/health"
```

## Success Criteria

- Service accessible: `https://notifications.statex.cz/health` returns success
- Internal access: `http://notifications-microservice:3368/health` returns success
- No errors in logs: `docker compose logs logging-service | grep -i error`

## Notes

- Port: 3368
- Internal URL: `http://notifications-microservice:3368`
- External URL: `https://notifications.statex.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/notifications-microservice.json`
- Environment: `.env` file in project root (PORT=3368)
