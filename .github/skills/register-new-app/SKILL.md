---
name: register-new-app
description: Use whenever creating, initializing, registering, onboarding, or integrating a new Alfares application, service, worker, or infrastructure repository. Creates the standard project harness and enforces IPS, ecosystem integration, observability, deployment, agent, and docs-RAG requirements.
---

# Register a New Alfares Application

This is the mandatory agent entry point for every new repository added to the
Alfares ecosystem. Git documents remain authoritative; this skill orchestrates
their use and must not duplicate or weaken them.

## Read before acting

1. `/home/ssf/Documents/Github/shared/docs/DOCUMENTATION_AUTHORITY.md`
2. `/home/ssf/Documents/Github/shared/ECOSYSTEM_MAP.md`
3. `/home/ssf/Documents/Github/shared/docs/CREATE_SERVICE.md`
4. `/home/ssf/Documents/Github/shared/docs/DEPLOY_STANDARD.md`
5. `/home/ssf/Documents/Github/intent-preservation-system/docs/24_onboarding/PROJECT_ADOPTION_STANDARD.md`
6. `/home/ssf/Documents/Github/intent-preservation-system/docs/24_onboarding/PROJECT_DOCUMENT_SET.md`
7. The approved source specification and intent for the new project

## Phase 1: create the non-destructive harness

Run from the `shared` checkout:

```bash
python3 scripts/scaffold-new-service.py <repository> \
  --repository https://github.com/speakASAP/<repository>
```

Add `--port <port>` only after the port is verified against both
`ECOSYSTEM_MAP.md` and live Kubernetes Services. Add `--domain <domain>` only
when public ingress is approved. For a runtime service, identify every required
Vault key before onboarding and use `--with-secrets`; a service must never defer
its runtime secret and ExternalSecret wiring to a later implementation phase. The command:

- initializes the Git repository when needed;
- installs the shared pre-commit safety hook and, for an eligible runtime
  repository, the serialized deploy-queue post-commit hook;
- invokes the central IPS adoption scaffolder;
- creates the complete root, intent, governance, planning and validation set;
- creates `.gitignore` and `.env.example` safely;
- when a port is supplied, renders maintained deployment and Kubernetes
  templates with `IPS_ADOPTION_REQUIRED=1`;
- never overwrites existing files or invents intent, integrations, secrets,
  ports, domains, runtime code or approval evidence.

## Phase 1a: establish runtime identity and secret baseline

Complete this phase before application code or any user-facing Auth redirect is
considered ready. Do not substitute a guessed client id, a global role, plaintext
Kubernetes Secret, or a future task for this setup.

For every user-facing application:

1. Register or update its Auth application identity through
   `POST /auth/admin/applications/register` as an authorized platform administrator.
   Use the stable repository/service id as `name`, set `type: user_facing`, the
   approved public domain, display name, and description; confirm it is active.
2. Create and activate its application-scoped `user` role. Hosted Auth grants
   `app:<application-name>:user` on first successful sign-in; without this exact
   default role, a valid password or one-time code fails after verification.
3. Validate the exact hosted Auth flow before launch: the registered `client_id`,
   HTTPS `return_url`, and state-validated callback must succeed. Credentials are
   entered only at `auth.alfares.cz`.

For every runtime service, including an internal service:

1. Create its production dependency baseline at onboarding, not after the first
   deployment. Where the approved system requires them, this includes:
   - a dedicated PostgreSQL database/schema and least-privilege service role;
   - a private MinIO bucket plus credentials scoped only to that bucket;
   - an Auth application identity plus `user`, `editor`, and/or `admin` roles
     appropriate to the approved authorization model;
   - the platform logging ingestion credential from Kubernetes Secret
     `logging-ingest-credentials` key `LOGGING_SERVICE_TOKEN`; and
   - all database, storage, Auth, logging, callback, encryption/signing, provider,
     and third-party keys required by the production dependency graph.
   Mark a dependency `not-applicable` only with an approved system-specific reason.
2. Inventory the exact Vault key names and purposes. Record key names and purpose
   only; never values in Git, documentation, or terminal output.
3. Create the service-scoped Vault path `secret/prod/<service>`, write the required
   service-specific values there, and declare those keys in
   `k8s/external-secret.yaml` using ESO. Runtime pods consume the generated Secret
   through `envFrom.secretRef`; never create a plaintext `Secret` manifest.
   Reference shared platform credentials, including logging ingestion, directly
   from their canonical Kubernetes Secret with `env[].valueFrom.secretKeyRef`.
   Do not copy or mint a logging bearer token in the service-specific Vault path
   unless the logging authentication authority explicitly changes that contract.
4. Verify the ExternalSecret reaches `Ready=True`, the workload starts with the
   intended key names, and every required production dependency is reachable with
   its scoped identity. Keep values out of logs and transcripts.

A missing Auth identity/default user role or any unprovisioned required Vault key
is an onboarding blocker, not implementation debt. Mark unavailable requirements as
`[MISSING: ...]` and stop before exposing the application.

## Phase 2: complete intent and integration planning

Structure protected intent only from owner-approved source material. Obtain
durable human approval evidence for `BUSINESS.md`, the constitution and vision.

Review all capabilities in `ips-adoption.json` and
`docs/06_architecture/INTEGRATION_CONTRACT.md`. Every capability must be either
`required` or `not-applicable` with a project-specific reason. Required
integrations must define contract, configuration, failure mode and validation.

For runtime services and applications, these are always required:

- structured logging through `logging-microservice`;
- documentation registration through `docs-rag-microservice`;
- `GET /health`, Kubernetes probes and monitoring through
  `monitoring-microservice`.

Do not connect every component blindly. Authentication, PostgreSQL, Redis,
notifications, AI, payments, catalog, orders, warehouse, invoices, MinIO,
RabbitMQ and backups are connected only when the approved system requires them.

Before implementation:

```bash
python3 ../intent-preservation-system/scripts/validate_adoption_profile.py \
  --root . --phase planning
```

Do not write implementation code while this gate fails. Keep unavailable facts
as `[MISSING: ...]` or `[UNKNOWN: ...]` and obtain owner input.

## Phase 3: register the ecosystem identity

After the GitHub repository, `origin`, approved port/domain and ecosystem-map
entry exist, rerun the harness with `--register-catalog`:

```bash
python3 ../shared/scripts/scaffold-new-service.py <repository> \
  --repository https://github.com/speakASAP/<repository> \
  --port <verified-port> \
  --register-catalog
```

Registration adds `ipsAdoptionRequired: true` to the canonical repository
catalog. The catalog validator rejects a newly added repository without that
flag and runs the IPS planning gate for every flagged repository. Registration
also generates the repository's Copilot instructions and local Copilot skill.

## Phase 4: implement and validate

- Preserve `Vision -> Goal Impact -> System -> Feature -> Task -> Execution
  Plan -> Coding Prompt -> Code -> Validation`.
- Use service-scoped database roles, Kubernetes service DNS, and the Vault/ESO
  baseline established in Phase 1a; never create parallel infrastructure or identity.
- Use only maintained shared deployment templates and the serialized deploy
  runner. Sub-agents must stop before deployment.
- Record targeted tests and integration evidence in the bootstrap validation
  report.
- Run the deployment-phase validator before deployment. Shared deploy preflight
  repeats it because generated `deploy.config.sh` sets
  `IPS_ADOPTION_REQUIRED=1`.
- Verify docs-RAG direct Git ingestion returns the owning repository path.

The service is not onboarded until its Auth identity and default user role (when
user-facing), Vault/ESO key baseline, catalog, ecosystem map, integration contract,
generated agent entry points, planning and deployment gates, runtime health, required
integrations and validation evidence all agree.
