## Goal

Restore full observability and reliable delivery tracking for inbound emails sent from `notifications-microservice` to the SpeakASAP helpdesk, starting with fixing `/email/inbound/undelivered` (HTTP 500 caused by missing `WebhookDelivery` metadata).

## Plan and Status

- ✅ Diagnose `/email/inbound/undelivered` 500 error and locate TypeORM configuration for entities.
- ✅ Confirm `WebhookDelivery` entity is registered in `src/data-source.ts` but missing from `shared/database/database.module.ts` (Nest `TypeOrmModule.forRoot`).
- ✅ Define minimal fix to align Nest TypeORM entities with CLI `DataSource` config (add `WebhookDelivery` to `entities` array).
- ⬜ Implement code change in `shared/database/database.module.ts` to include `WebhookDelivery` in `entities`.
- ⬜ Rebuild notifications-microservice locally and verify that `/email/inbound/undelivered` works against a test database (no `EntityMetadataNotFoundError`).
- ⬜ After deploy to prod, rerun `./scripts/check-undelivered-to-helpdesk.sh` on `statex` and confirm it returns data instead of HTTP 500.
- ⬜ Use the now-working endpoint to inspect undelivered helpdesk webhooks and feed findings into the helpdesk-side fix plan in `speakasap-portal`.
