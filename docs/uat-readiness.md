# UAT and production-readiness checklist

Use this checklist against the exact release build and deployment environment.
Record the tester, build identifier, browser, date, seed accounts, and any
defect IDs beside the completed checklist. Do not use real patient data in UAT.

## Preflight

- Install dependencies from lockfiles with `npm ci` in `backend` and
  `frontend`.
- Apply database migrations with `npx prisma migrate deploy` against the UAT
  database.
- Seed or create at least: patient A, patient B, one assigned doctor, one
  unassigned doctor, one administrator, and enough sample records for each
  feature below.
- Confirm no live `.env`, `.env.production`, TLS private key, database dump, or
  provider credential is tracked by Git.
- Rotate any secret ever pasted into chat, tickets, screenshots, commits, or
  shared terminals before production.

## Patient UAT

- Register a new patient account; verify role is `PATIENT` and no role can be
  selected or injected from the browser.
- Login, refresh the page, and confirm the session remains valid through the
  refresh-cookie flow.
- Update profile fields and emergency contacts; confirm required labels,
  validation messages, keyboard navigation, and visible focus states.
- Create, update, filter, and delete medications; mark dose logs taken, missed,
  skipped, and pending where allowed.
- Record measurements with valid and invalid values; confirm invalid input is
  rejected before saving.
- Schedule, reschedule, cancel, and view appointments with assigned doctors.
- Review dashboard calendar items for appointments, medication reminders, and
  follow-ups.
- Create and update health goals; record progress; confirm progress indicators
  and screen-reader progress text.
- Use global patient search for medications, measurements, appointments, and
  timeline entries; confirm results are scoped to the logged-in patient.
- Connect/update/remove a wearable demo device and run a demo sync.
- Review health alerts and alert rules; acknowledge and resolve alerts.
- Trigger and resolve emergency mode in a non-production test account.
- Confirm patient A cannot access patient B data by direct URL/API probes; the
  expected response for foreign object IDs is `404` unless the route is simply
  wrong-role, which should be `403`.

## Doctor UAT

- Login as a doctor with assigned and unassigned patients available.
- View assigned patients; search/filter if data volume supports it.
- Open an assigned patient detail page and confirm medications, measurements,
  alerts, check-ins, symptoms, documents, goals, and monitoring data are visible
  only for active assignments.
- Create and update doctor notes for an assigned patient.
- Create follow-ups and follow-up plans/tasks; confirm immutable follow-up
  history behaves as designed.
- Review monitoring summaries, unusual changes, active alerts, and appointment
  lists.
- Schedule/update doctor-side appointments only for assigned patients.
- Attempt to open an unassigned patient by ID; expect `404`.
- Attempt patient-only routes with the doctor token; expect `403`.

## Admin UAT

- Login as an administrator.
- Review dashboard counts and security dashboard data.
- Search users and inspect patient, doctor, and admin accounts.
- Create/update users and doctor profiles; verify invalid role/profile
  transitions are rejected.
- Create and revoke doctor-patient assignments; confirm the doctor's clinical
  access changes immediately.
- Review doctor directory and assignment counts.
- Review audit logs and filters after patient, doctor, and admin mutations.
- Attempt patient-only and doctor-only clinical routes with the admin token;
  expect `403` unless the endpoint is explicitly documented as admin-scoped.

## Authentication and session checks

### Expected 401 behavior

- Missing access token is rejected with `401`.
- Expired access JWT is rejected with `401`.
- Invalid, tampered, or unsigned access token is rejected with `401`.
- Invalid, expired, revoked, or reused refresh token is rejected with `401`.
- Access token for a deleted, disabled, or suspended user is rejected with
  `401` or the documented account-status authentication failure.

### Expected 403 behavior

- Authenticated patient calling doctor-only or admin-only routes receives
  `403`.
- Authenticated doctor calling patient-only self-service or admin-only routes
  receives `403`.
- Authenticated admin calling patient-only or doctor-only clinical routes
  receives `403` unless the route is explicitly admin-scoped.
- Role changes in the database override stale role claims in existing tokens.

### Session lifecycle

- Database role changes override stale role claims in an existing token.
- Refresh token rotates on use and returns a new access token.
- Reuse of a rotated refresh token is rejected and revokes the affected session
  family.
- Logout clears the refresh cookie and revokes the current session.
- Revoke one session removes only the selected owned session.
- Revoke all sessions removes other sessions while preserving the current
  session if that is the configured behavior.
- Password change succeeds with the old password and revokes other active
  sessions; old refresh cookies and stale sessions must fail afterward.
- Password reset consumes a single-use token, changes the password, and revokes
  sessions.
- Missing token, malformed token, expired token, wrong role, and out-of-scope
  object all return the documented `401`/`403`/`404` status without leaking
  protected record details.

## Authorization isolation

- Patient A can list, create, update, and delete only Patient A resources.
- Patient A direct requests for Patient B object IDs return sanitized `404`
  when the route is patient-scoped.
- Doctor assigned-patient access works only for active assignments.
- Doctor access to unassigned, revoked, or expired patient assignments returns
  `404` for patient-object routes or `403` for wrong-role routes, without
  revealing that the patient exists.
- Admin assignment changes take effect without requiring the doctor to log out
  and back in.

## Accessibility checks

- Navigate patient, doctor, and admin pages by keyboard only.
- Confirm every form control has a visible or programmatic label.
- Confirm dynamic status/error messages use `role="alert"` or polite live
  regions where appropriate.
- Confirm modal/dialog focus management if any dialog is opened in the flow.
- Confirm focus indicators are visible in light and dark mode.
- Confirm text, controls, badges, alerts, and chart labels maintain acceptable
  contrast in light and dark mode.
- Confirm color is not the only indication of alert, goal, appointment, or dose
  status.
- Confirm dark mode preserves focus visibility, chart contrast, form labels,
  validation text, and notification/alert severity contrast.
- Confirm Arabic/RTL rendering by switching the browser/page direction where
  supported: navigation order, form labels, tables, calendar controls, cards,
  icons, charts, and truncation should remain readable and keyboard reachable.
- Confirm mixed Arabic/English text, numbers, dates, medication names, and email
  addresses do not overlap or reverse in a way that changes meaning.

## Production readiness gate

Run these commands against the release commit:

```bash
cd backend
npx prisma validate
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:security
npm run build
npm audit --omit=dev

cd ../frontend
npm run lint
npm run test:run
npm run build
npm audit --omit=dev
```

Then verify:

- `.env.production` is injected by the deployment platform or an untracked,
  permission-restricted host file.
- `APP_PUBLIC_URL` and `CORS_ORIGIN` are HTTPS origins for the deployed web
  host, not `localhost` or wildcard values.
- `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and
  `AUTH_REQUIRE_VERIFIED_EMAIL=true`.
- `JWT_SECRET`, SMTP password, VAPID private key, database password, and TLS
  private key are real rotated secrets in the secret manager.
- Frontend production build uses the intended API URL. The supplied Compose
  deployment builds with `VITE_API_URL=/api/v1` so browser calls stay same
  origin behind NGINX.
- Prisma migration SQL has been reviewed; destructive or non-backward-compatible
  migrations have an approved maintenance window and rollback plan.
- `docker compose --env-file .env.production -f docker-compose.production.yml config --quiet`
  succeeds without placeholder values.
- `npm run verify:production` passes with production environment variables.
- Latest backup and restore drill evidence is current, and off-site backups are
  encrypted, checksummed, and monitored.

## Deployment and smoke tests

Deploy staging first. Production deployment follows the same commands in
[deployment.md](deployment.md), using production secrets and certificates.

After deployment:

- `GET https://<host>/` returns the web app.
- `GET https://<host>/api/v1/health` succeeds.
- `http://<host>/` redirects permanently to HTTPS.
- TLS 1.2/1.3 succeeds; TLS 1.0/1.1 fails.
- HSTS, CSP, frame, referrer, and `nosniff` headers are present.
- Browser login, refresh, logout, and password-change flows work.
- Patient, doctor, and admin dashboards load without console errors.
- CORS allows the production web origin with credentials and rejects an
  unapproved origin.
- Audit logs capture representative patient, doctor, admin, auth, and security
  events without credentials or patient payloads in ordinary logs.

Block release for failed tests, unresolved high/critical production dependency
audit findings, placeholder secrets, wildcard production CORS, failed
migrations, missing backup/restore evidence, or any reproduced cross-role or
cross-patient data exposure.
