# GOAL-04: Channel Policy And Template Gap

## Objective

Resolve the operational gap between documented template/channel management goals and the current implementation, without inventing unsupported backend behavior.

## Scope

- Channel registry admin UX and APIs.
- README/docs mismatch around templates and webhook routes.
- Optional backend design for persisted templates if owner approves.
- Admin copy and docs that distinguish current inline message/template-data behavior from future template management.

## Acceptance Criteria

- Operators can understand what channel policy is active and editable.
- Documentation no longer implies implemented persisted templates where none exist.
- Any template feature proposal is clearly separated from implemented functionality.
- No secrets or provider credentials are exposed.

## Validation

- Documentation review.
- `npm run build` if code changes are made.
- Browser/API check for changed admin channel policy behavior.

## Done Report

Use the required Intent Compliance Report from `implementation-goals/README.md`.
