/**
 * Notifications role vocabulary.
 *
 * Every route must carry exactly one of these constants, or @Public. Nothing may
 * rely on a guard default: an undecorated route used to inherit
 * [global:superadmin, internal:notifications-microservice:admin], so forgetting a
 * policy granted the broadest access in the service rather than failing review.
 *
 * Three tiers, narrowest first:
 *   SEND   - queue a notification. What every consuming service actually needs;
 *            nothing else in this list does.
 *   READ   - inspect delivery history, status and inbound mail.
 *   ADMIN  - mutate channel configuration, reparse inbound mail, manage webhook
 *            subscriptions. Operator surface, no service caller.
 *
 * `internal:notifications-microservice:send` is the role minted for per-pair
 * service JWTs from consumers (invoices, monitoring, backups, cv-tuning, runlayer).
 * It deliberately cannot read another tenant's delivery history.
 */

export const NOTIFICATIONS_SEND_ROLES = [
  'global:superadmin',
  'internal:notifications-microservice:admin',
  'internal:notifications-microservice:send',
] as const;

export const NOTIFICATIONS_READ_ROLES = [
  'global:superadmin',
  'internal:notifications-microservice:admin',
  'internal:notifications-microservice:readonly',
] as const;

export const NOTIFICATIONS_ADMIN_ROLES = [
  'global:superadmin',
  'internal:notifications-microservice:admin',
] as const;

/**
 * Inbound mail ingestion from the SES/S3 pipeline. Separated from ADMIN so the
 * mail path cannot reach channel configuration.
 */
export const NOTIFICATIONS_INBOUND_ROLES = [
  'global:superadmin',
  'internal:notifications-microservice:admin',
  'internal:notifications-microservice:inbound',
] as const;
