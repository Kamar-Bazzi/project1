# Security model and final verification

This system handles health information. Production use requires a privacy and
risk assessment appropriate to the operator's jurisdiction in addition to the
technical controls described here.

## Trust boundaries and assets

The primary assets are credentials, refresh sessions, patient clinical data,
doctor assignments, notification endpoints, audit records, and backups. The
public browser and network are untrusted. NGINX terminates TLS; the API and
database communicate only on private container networks. SMTP, push, and
off-site backup services are separate third-party trust boundaries.

## Required controls

- Passwords are hashed with an adaptive password hash and are never logged or
  returned.
- Access JWTs are short lived and signature/expiry checked; production also
  pins their issuer and audience. Authentication
  reloads the current user, role, account status, and verification state rather
  than trusting mutable authorization claims in a token.
- Refresh tokens are opaque, hashed at rest, rotated on use, and carried in a
  `Secure`, `HttpOnly`, appropriately scoped cookie. Reuse revokes the affected
  session family.
- Password-reset and verification tokens are single-use, time limited, and
  stored only as hashes. Responses do not disclose whether an email exists.
  Email links carry them in a URL fragment rather than a request query, and the
  SPA removes the fragment from browser history before the API submission.
- Patient endpoints derive ownership from the authenticated identity. Foreign
  resource IDs return `404` so they cannot be enumerated.
- Doctor clinical reads require an active explicit doctor–patient assignment in
  every data query. Appointments never act as access grants.
- Administration routes require the current database role `ADMIN`; sensitive
  changes create audit records.
- Global validation rejects unknown fields, malformed values, and attempted
  mass assignment. Request bodies are bounded at the gateway.
- Nest applies security headers and a 120-request/minute application limit.
  NGINX adds an edge burst limit and passes the real client address through one
  trusted proxy hop.
- CORS has an explicit HTTPS origin in production. TLS 1.2/1.3 and HSTS are
  enabled at the gateway.
- Runtime secrets exist only in environment variables supplied by a secret
  manager or an untracked deployment file. Images and source control contain
  placeholders only.
- Web-push endpoints are limited to known browser push services or explicit
  `WEB_PUSH_ALLOWED_ORIGINS`, preventing subscriptions from becoming an SSRF
  primitive.
- Backups are checksummed, access controlled, encrypted by the storage layer,
  copied off host, and restored in a scheduled drill.
- Structured HTTP completion logs contain only a generated request ID, method,
  path without query values, status, and duration. Authorization headers,
  cookies, bodies, health data, and provider/reset tokens are never included.

## Threat-to-control map

| Threat                                     | Control                                      | Regression evidence                                                     |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| Expired access JWT                         | Passport JWT expiry validation               | Security e2e test expects `401` before database access                  |
| Modified JWT payload                       | Signature verification                       | Security e2e test changes the role without re-signing and expects `401` |
| Role escalation                            | Current database role plus role guard        | Privileged claim for a patient still receives `403`                     |
| Cross-patient record lookup                | Owner ID in the database predicate           | Foreign measurement returns `404`                                       |
| Cross-user notification/session mutation   | User ID in update/revoke predicate           | Foreign notification, subscription, and session IDs cannot be mutated   |
| Doctor reads unassigned patient            | Active assignment in every doctor query      | Doctor security e2e test returns `404` for inactive/missing grant       |
| Mass assignment                            | Whitelist plus `forbidNonWhitelisted`        | Supplied `role` or `patientId` receives `400`                           |
| Malformed path/body                        | DTO validation and parsing pipes             | Invalid UUID/body receives `400` before service access                  |
| Brute force or request flood               | Route-specific, application, and edge limits | Login request 6 and generic request 121 receive `429`                   |
| Deleted/deactivated account uses old token | Database user/session reload                 | Deleted-user JWT receives `401`                                         |
| Stolen database backup                     | Encrypted restricted storage plus retention  | Restore drill and storage-policy review                                 |

The executable test suite is
[`backend/test/security.e2e-spec.ts`](../backend/test/security.e2e-spec.ts).
It contains 101 passing endpoint cases and includes the complete new-route
patient/doctor/admin denial matrices in addition to object-level predicate
assertions.

## Release security gate

Run these commands against the exact release commit:

```bash
cd backend
npm ci
npx prisma validate
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:security
npm run build
npm audit --omit=dev
npm run verify:backup-restore

cd ../frontend
npm ci
npm run lint
npm run build
```

Then complete the environment and runtime checks:

1. Run `npm run verify:production` with production environment variables.
2. Confirm `docker compose ... config` exposes no default/placeholder secrets.
3. Confirm plain HTTP redirects to HTTPS and TLS 1.0/1.1 fail.
4. Confirm HSTS, CSP, `nosniff`, frame protection, and referrer headers.
5. Confirm CORS permits only the production web origin with credentials.
6. Confirm Swagger is intentionally enabled or disabled; never persist a real
   bearer token in its UI.
7. Test login, logout, refresh rotation/reuse, password reset, verification,
   account deactivation, and session revocation from a clean browser.
8. Repeat cross-patient and unassigned-doctor probes with real seeded accounts.
9. Verify SMTP and web-push failures are redacted and retried without logging
   credentials or full token URLs.
10. Review the machine-readable
    [fresh restore evidence](backup-restore-evidence.md), then restore the newest
    off-site backup into an isolated database, run integrity checks, record
    recovery time, and destroy the restored copy securely.

Do not release when a production dependency audit reports a high or critical
finding, when the security suite fails, or when the latest backup has not
passed its checksum/off-site replication checks.

## Operational response

For a suspected credential or health-data incident: preserve append-only audit
and gateway logs, revoke affected sessions, rotate application/provider
secrets, restrict access, snapshot relevant evidence, and follow the operator's
breach-notification process. Never send credentials, raw reset links, push
subscriptions, or patient data through ordinary support chat.
