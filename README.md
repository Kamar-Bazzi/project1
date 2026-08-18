# Medical Tracking Platform

A role-scoped medical tracking application for patients, explicitly assigned
doctors, and administrators. The repository contains a NestJS/PostgreSQL API
and a React/Vite web client.

## What is included

- Patient medications, dose history, measurements, wearable metrics, health
  alerts, emergency contacts, appointments, and notifications
- Doctor access that requires an active patient assignment for every clinical
  read
- Administrative account, role, assignment, and audit-log management
- Short-lived access tokens, rotating sessions, account recovery, email
  verification, and rate limiting
- Live OpenAPI/Swagger documentation and a containerized HTTPS deployment
- Checksummed PostgreSQL backups and a tested restore procedure

## Local development

Prerequisites are Node.js 22+, npm, and PostgreSQL.

```bash
cd backend
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run start:dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

The UI is available at `http://localhost:5173`. The API is under
`http://localhost:3000/api/v1`, with Swagger UI at
`http://localhost:3000/api/v1/docs`.

## Verification

```bash
cd backend
npm test
npm run test:e2e
npm run test:security
npm run build
npm audit --omit=dev

cd ../frontend
npm run lint
npm run build
```

## Documentation

- [Final project report](docs/final-report.md)
- [API reference](docs/api-reference.md)
- [Architecture and diagrams](docs/architecture.md)
- [Security model and verification](docs/security.md)
- [Production deployment, HTTPS, and backups](docs/deployment.md)
- [Backup/restore verification evidence](docs/backup-restore-evidence.md)
- [Wearable-health boundary](docs/wearable-health.md)

Production secrets belong in the deployment platform's secret manager or an
untracked `.env.production`; start from `.env.production.example`. Never place
credentials or TLS private keys in source control.
