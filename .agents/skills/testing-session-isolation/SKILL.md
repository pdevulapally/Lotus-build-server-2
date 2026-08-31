---
name: testing-lotus-backend-api
description: How to run and API-test the Lotus NestJS backend locally (Postgres, Redis, Firebase auth tokens, multi-user isolation tests)
---

# Testing the Lotus backend API locally

## Services
- Postgres: `docker compose up -d postgres`, then `npx prisma migrate dev`.
- Redis (required, with password matching REDIS_URL): `docker run -d --name redis-test -p 6379:6379 redis:7-alpine redis-server --requirepass testpass` and `REDIS_URL=redis://:testpass@127.0.0.1:6379`.
- Node >= 22.12 (`export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH`). Start: `npm run start:dev`, base URL `http://localhost:3000/api/v1`.

## Minting Firebase ID tokens for test users (no browser needed)
- Auth requires real Firebase ID tokens with `email_verified: true` (checked in src/auth/token-verifier.service.ts).
- Use the FIREBASE_SERVICE_ACCOUNT_JSON secret with firebase-admin to create/update email+password users with `emailVerified: true`, then sign in via the Identity Toolkit REST API `accounts:signInWithPassword`.
- The Web API key can be fetched programmatically: get a google-auth access token from the service account and call `https://firebase.googleapis.com/v1beta1/projects/<pid>/webApps` then `.../<appName>/config` → `apiKey`. A working script pattern is scripts/mint-tokens.mjs (writes tokens to /tmp/tokens.json).
- ID tokens expire after 1h; re-run the mint script if you get 401s.

## Multi-user setup pattern
- Users are auto-provisioned on first authenticated request — hit `GET /organizations` with each token before adding them as members by email.
- Creator of an org is OWNER; add others via `POST /organizations/:id/members {email, role}`.
- Isolation model: MEMBER sees only sessions they created (404 on others); OWNER/ADMIN see all in org; non-member → 403 from OrgMembershipGuard.

## Gotchas
- The ANTHROPIC_API_KEY in a copied .env may be invalid → agent runs fail fast with 401 from Anthropic; SSE still emits run_started/run_failed so pub/sub can be verified without a valid key.
- SSE endpoint: `GET /organizations/:orgId/agent-runs/:runId/events` with `curl -N`; attach immediately after creating the run to catch events.

## Devin Secrets Needed
- FIREBASE_SERVICE_ACCOUNT_JSON (token minting), ANTHROPIC_API_KEY (real agent runs), E2B_API_KEY (sandboxes).
