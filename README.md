# Backend

Enterprise-grade NestJS + TypeScript backend with Prisma and PostgreSQL.

## Principles

- **Fail-fast configuration** — every environment variable is validated with Zod at boot; the app refuses to start on missing or invalid config. No defaults for secrets, no fallbacks.
- **No dummy data** — all data is created through the API; there are no seeds or fixtures.
- **Firebase Authentication** — ID tokens (Google sign-in and email/password) are verified with the Firebase Admin SDK, including revocation checks; email/password identities must be verified. Users are provisioned on first authenticated request, keyed by Firebase `uid`.
- **Hybrid persistence** — PostgreSQL is the relational source of truth; real-time documents (agent runs/steps, session messages, org membership) are mirrored to Firestore for client subscriptions. Mirror writes are awaited and failures propagate — no silent divergence.
- **E2B sandboxes** — every agent run executes in its own isolated E2B microVM; sandboxes are killed on completion, failure, or cancellation. There is no host-side execution fallback.
- **Authorization** — org-scoped RBAC (OWNER / ADMIN / MEMBER) enforced by guards on every org route.
- **Security** — helmet, strict CORS allowlist, global rate limiting, validation with whitelisting (unknown fields rejected), API-key secrets stored as SHA-256 hashes and compared in constant time, auth headers redacted from logs.
- **Auditability** — mutating operations write structured audit logs.

## Stack

NestJS 10 · TypeScript (strict) · Prisma 5 · PostgreSQL 16 · Firebase Admin (Auth + Firestore) · E2B · Anthropic SDK · Zod · nestjs-pino · @nestjs/throttler · @nestjs/terminus

## Getting started

Requires Node.js >= 22.12 (the E2B SDK relies on `require(esm)` support).

```bash
cp .env.example .env   # fill in every value — all are required
docker compose up -d postgres
npm ci
npx prisma migrate dev
npm run start:dev
```

Required external services:

- **Firebase** — create a project, enable the Google and Email/Password sign-in providers, generate a service-account key (Project settings → Service accounts) and set the whole JSON as `FIREBASE_SERVICE_ACCOUNT_JSON`. Deploy `firestore.rules` to lock Firestore down (clients get read-only, org-scoped access; all writes go through this backend).
- **E2B** — set `E2B_API_KEY` (https://e2b.dev). Each agent run gets its own microVM, auto-expired after `E2B_SANDBOX_TIMEOUT_SECONDS`.
- **Anthropic** — set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

## API

All routes are prefixed with `/api/v1` and require a Bearer token except `/health`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | public; checks DB connectivity |
| GET | `/users/me` | current user profile |
| POST / GET | `/organizations` | create / list orgs |
| GET | `/organizations/:organizationId` | member-only |
| GET / POST | `/organizations/:organizationId/members` | POST requires OWNER/ADMIN |
| GET | `/organizations/:organizationId/audit-logs` | OWNER/ADMIN |
| POST / GET | `/organizations/:organizationId/sessions` | member-only |
| GET / PATCH | `/organizations/:organizationId/sessions/:sessionId` | member-only |
| GET / POST | `/organizations/:organizationId/sessions/:sessionId/messages` | member-only |
| POST / GET | `/organizations/:organizationId/api-keys` | OWNER/ADMIN; secret shown once |
| DELETE | `/organizations/:organizationId/api-keys/:apiKeyId` | OWNER/ADMIN; revoke |
| POST / GET | `/organizations/:organizationId/sessions/:sessionId/agent-runs` | start / list agent runs |
| GET | `/organizations/:organizationId/agent-runs/:runId` | run status |
| GET | `/organizations/:organizationId/agent-runs/:runId/steps` | persisted transcript |
| GET | `/organizations/:organizationId/agent-runs/:runId/events` | SSE live stream |
| POST | `/organizations/:organizationId/agent-runs/:runId/cancel` | request cancellation |

## Autonomous agent

Claude Code-style agent runs: each run executes an Anthropic tool-use loop
(`read_file`, `write_file`, `list_files`, `bash`) inside its own isolated E2B
cloud sandbox (microVM). Tool paths are confined to the sandbox workspace
(absolute paths and traversal rejected), bash commands run with a timeout and
capped output, every step is persisted to Postgres (`agent_steps`) and
mirrored to Firestore (`agentRuns/{runId}/steps`), and progress is streamed
live over SSE. Runs are bounded by `AGENT_MAX_ITERATIONS`, can be cancelled,
and the sandbox is always killed when the run ends.

## Scripts

- `npm run build` / `npm run start:prod`
- `npm run lint` / `npm run lint:check`
- `npm test`
- `npm run prisma:migrate` (dev) / `npm run prisma:deploy` (prod)
