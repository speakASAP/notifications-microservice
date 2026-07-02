# Invoices Documents Notification Contract

Date: 2026-07-02
Remote workspace: `alfares:/home/ssf/Documents/Github/notifications-microservice`

## Intent Preservation Chain

- Vision: Statex customers can receive proforma and final invoice document links through the shared Notifications service.
- Goal Impact: Invoices can preflight and later send invoice document notifications without bypassing centralized channel policy.
- System: `invoices-microservice` produces invoice document payloads; `notifications-microservice` authenticates the service actor, resolves `channel_registry`, records sends only on `/notifications/send`, and calls email providers only after validation succeeds.
- Feature: Invoice document delivery over `channelKey=invoices.documents`.
- Task: Define the Notifications-owned channel/template contract and a no-send readiness check.
- Execution Plan: Keep source changes limited to contract docs, focused tests, and `POST /notifications/validate` readiness; leave Vault, channel row provisioning, deploy, and scaling to the runtime lane.
- Coding Prompt: Do not send real notifications, mutate channel rows, write secrets, deploy, or contact customers.
- Code: `JwtRolesGuard` accepts `INVOICES_NOTIFICATIONS_SERVICE_TOKEN`; channel policy tests cover `invoices.documents`; readiness script uses `/notifications/validate` only.
- Validation: Unit tests/build/diff checks in source lane; runtime lane must run the readiness script after token and channel row provisioning.

## Required Producer Payload

`invoices-microservice` must call Notifications with these fields for both proforma and final invoices:

```json
{
  "channel": "email",
  "type": "order_confirmation | payment_confirmation",
  "recipient": "customer email",
  "subject": "Proforma invoice <number> | Final tax invoice <number>",
  "message": "<label> <number> is ready: <download URL>",
  "service": "invoices-microservice",
  "purpose": "transactional",
  "channelKey": "invoices.documents",
  "templateData": {
    "invoice": {
      "id": "invoice id",
      "type": "proforma | final",
      "invoiceNumber": "invoice number",
      "orderId": "order id"
    }
  }
}
```

Current Notifications behavior uses the inline `message` plus optional `templateData` substitution. There is no persisted invoice template row, template catalog, or template CRUD requirement for this lane.

## Required Runtime Channel Policy

Runtime provisioning must create or update exactly one active channel policy row before live invoice sends:

| Field | Required value |
|---|---|
| `channelKey` | `invoices.documents` |
| `type` | `email` |
| `provider` | `ses` unless the runtime owner intentionally chooses another active email provider |
| `isActive` | `true` |
| `applicationsAllowed` | includes only `invoices-microservice` unless another owner-approved producer is added |
| `purposesAllowed` | includes `transactional` |
| `fromEmail` / `fromName` / `replyToEmail` | approved sender identity or `null` to use provider defaults |
| `fallbackChannelKey` | `null` unless an explicit fallback policy is approved |

## No-Send Readiness

After runtime provisioning, run:

```bash
ssh alfares 'cd /home/ssf/Documents/Github/notifications-microservice && ./scripts/check-invoices-documents-readiness.sh'
```

The script reads `INVOICES_NOTIFICATIONS_SERVICE_TOKEN` from the Kubernetes secret and calls `POST /notifications/validate` for proforma and final invoice payloads using `invoice-smoke@example.invalid`. Expected result: HTTP 200/201 with `mutation=false` and `providerCall=false` for both payloads.

## Boundaries

- No real `/notifications/send` call in this lane.
- No provider dispatch.
- No channel row mutation from the source lane.
- No Vault writes from the source lane.
- No customer data mutation or customer contact.

## Runtime Provisioning Evidence

Completed on 2026-07-02:

- Vault path `secret/prod/invoices-microservice` contains `NOTIFICATIONS_SERVICE_TOKEN`; value was not printed.
- `notifications-microservice-secret` contains `INVOICES_NOTIFICATIONS_SERVICE_TOKEN`.
- `channel_registry` contains active `invoices.documents` policy with `type=email`, `provider=ses`, `purposesAllowed={transactional}`, and `applicationsAllowed={invoices-microservice}`.
- Deployed image digest is `sha256:4e12aef822773d9ffec333db6417403ac6b5a73cf855ab8e25fb2bcb664f25a1`.
- `scripts/check-invoices-documents-readiness.sh` passed for proforma and final payloads with HTTP 201, `mutation=false`, and `providerCall=false`.
- Smoke recipient notification rows stayed `0 -> 0`.

## Remaining Caveat

- `[UNKNOWN: Approved invoice sender identity if provider defaults are not acceptable]`
