# Backend

Enterprise-grade NestJS + TypeScript backend with Prisma and PostgreSQL.

## Principles

- **Fail-fast configuration** — every environment variable is validated with Zod at boot; the app refuses to start on missing or invalid config. No defaults for secrets, no fallbacks.
- **No dummy data** — all data is created through the API; there are no seeds or fixtures.
- **Managed authentication** — JWTs from any OIDC provider (Auth0, Clerk, Supabase) are verified against the provider's JWKS endpoint (`jose`), checking issuer and audience. Users are provisioned on first authenticated request.
- **Authorization** — org-scoped RBAC (OWNER / ADMIN / MEMBER) enforced by guards on every org route.
- **Security** — helmet, strict CORS allowlist, global rate limiting, validation with whitelisting (unknown fields rejected), API-key secrets stored as SHA-256 hashes and compared in constant time, auth headers redacted from logs.
- **Auditability** — mutating operations write structured audit logs.

## Stack

NestJS 10 · TypeScript (strict) · Prisma 5 · PostgreSQL 16 · Zod · jose · nestjs-pino · @nestjs/throttler · @nestjs/terminus

## Getting started

```bash
cp .env.example .env   # fill in every value — all are required
docker compose up -d postgres
npm ci
npx prisma migrate dev
npm run start:dev
```

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

## Scripts

- `npm run build` / `npm run start:prod`
- `npm run lint` / `npm run lint:check`
- `npm test`
- `npm run prisma:migrate` (dev) / `npm run prisma:deploy` (prod)
