# CareTrack API

NestJS 11 and Prisma/PostgreSQL backend for the CareTrack medical tracking
platform. The API is versioned under `/api/v1` and serves Swagger UI at
`/api/v1/docs` when `SWAGGER_ENABLED=true`.

## Local setup

```bash
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run start:dev
```

Use Node.js 22+ and a PostgreSQL database. Patient ownership, doctor
assignments, and administrator roles are derived from the authenticated user;
clients must not invent patient ownership fields.

## Useful commands

```bash
npm run build
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:security
npx prisma validate
```

Access tokens are short-lived JWTs. Refresh tokens are rotated, hashed in the
database, and delivered only in an HttpOnly cookie. SMTP and VAPID credentials
are optional for local development and must be injected through environment
variables in production.

See the repository-level [README](../README.md), [API reference](../docs/api-reference.md),
[security guide](../docs/security.md), and [deployment runbook](../docs/deployment.md).
