# API reference

The REST API is versioned under `/api/v1`. Interactive Swagger UI is served at
`/api/v1/docs`; the machine-readable OpenAPI document is
`/api/v1/docs/openapi.json`. Set `SWAGGER_ENABLED=false` to remove both routes
in a deployment where API discovery is not desired.

## Conventions

- Send JSON with `Content-Type: application/json`.
- Send access tokens as `Authorization: Bearer <accessToken>`.
- Refresh and logout use the `caretrack_refresh` cookie. It is `HttpOnly`,
  `SameSite=Strict`, scoped to `/api/v1/auth`, and `Secure` in production.
- Browser medication requests send an IANA zone in `X-Time-Zone` when relevant.
- UUID route parameters are UUID v4. Timestamps are ISO 8601 with `Z` or an
  explicit offset. Medication date-only values use `YYYY-MM-DD`.
- DTOs reject missing, mistyped, out-of-range, and unknown properties. Clients
  never send ownership fields unless a role-specific endpoint explicitly lists
  one.
- Paginated results use
  `{ items, pagination: { page, pageSize, total, totalPages } }`.
- Deletes usually return `204 No Content`. A resource outside the caller's
  scope returns `404` rather than revealing that it exists.

Common errors are `400` invalid input, `401` absent/invalid/expired session,
`403` valid identity with the wrong role, `404` absent or out-of-scope object,
`409` uniqueness/state conflict, and `429` throttled. The default application
limit is 120 requests/minute per route/client. Login and registration are 5,
forgot-password and verification resend are 3, reset/verification confirmation
are 5/10, and refresh is 20 per minute.

## System and authentication

| Method | Path                               | Authentication            | Purpose                                           |
| ------ | ---------------------------------- | ------------------------- | ------------------------------------------------- |
| GET    | `/`                                | Public                    | API liveness response                             |
| GET    | `/health`                          | Public                    | API/PostgreSQL readiness without database details |
| GET    | `/database-check`                  | Admin access token        | Restricted database check                         |
| POST   | `/auth/register`                   | Public                    | Create a patient account and session              |
| POST   | `/auth/login`                      | Public                    | Authenticate and create a session                 |
| POST   | `/auth/refresh`                    | Refresh cookie            | Rotate the refresh token and access token         |
| POST   | `/auth/logout`                     | Optional refresh cookie   | Idempotently revoke/clear the current cookie      |
| POST   | `/auth/forgot-password`            | Public                    | Send a non-enumerating reset response/email       |
| POST   | `/auth/reset-password`             | Public reset token        | Consume token, change password, revoke sessions   |
| POST   | `/auth/email-verification/confirm` | Public verification token | Mark email verified                               |
| POST   | `/auth/email-verification/request` | Access token              | Send a fresh verification email                   |
| POST   | `/auth/email-verification/resend`  | Public                    | Non-enumerating resend by email address           |
| GET    | `/auth/sessions`                   | Access token              | List the caller's active sessions                 |
| GET    | `/auth/security-events`            | Access token              | List bounded security-event audit history         |
| PATCH  | `/auth/password`                   | Access token              | Change password and revoke other sessions         |
| DELETE | `/auth/sessions/:sessionId`        | Access token              | Revoke one owned session                          |
| DELETE | `/auth/sessions`                   | Access token              | Revoke all other sessions                         |
| GET    | `/auth/me`                         | Access token              | Current user, role/status, and verification state |

Registration accepts `name`, `email`, `password`, and optional `timeZone`;
role is always `PATIENT`. When production email verification is required,
registration returns `{ requiresEmailVerification: true, user }` and does not
create a session; otherwise it returns `{ accessToken, user }`. Login accepts
`email` and `password`. Successful login/refresh responses contain
`{ accessToken, user }`; the refresh token is cookie-only. Forgot password accepts `email`; reset and email
confirmation accept their one-time token plus the required new credential
fields shown in Swagger. Public verification resend accepts `email` and returns
the same response whether or not an eligible account exists.

## Appointments

All appointment routes accept patient, doctor, and administrator access tokens,
then apply identity-specific scope.

| Method | Path                    | Purpose                                                      |
| ------ | ----------------------- | ------------------------------------------------------------ |
| GET    | `/appointments`         | List scoped appointments with status/date pagination filters |
| GET    | `/appointments/doctors` | List doctors available to this actor                         |
| GET    | `/appointments/:id`     | Read one scoped appointment                                  |
| POST   | `/appointments`         | Schedule a future appointment                                |
| PATCH  | `/appointments/:id`     | Reschedule, change notes, complete, or cancel as permitted   |
| DELETE | `/appointments/:id`     | Patient/doctor cancellation; admin hard delete               |

Create accepts `appointmentDate`, optional `notes`, and role-dependent IDs:
patients supply an assigned `doctorId`, doctors supply an assigned `patientId`,
and admins supply both. Patients cannot create for another patient; doctors
cannot create for another doctor or an unassigned patient. A patient or doctor
collision at the same scheduled instant returns `409`. Patients may only set
status to `CANCELLED`; completed/cancelled appointments are immutable.

## Patient clinical API

These routes require a `PATIENT` access token and derive the patient from it.

| Resource           | Routes                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile            | `GET /patients/me`, `PATCH /patients/me`                                                                                                               |
| Medications        | `GET/POST /medications`, `GET/PATCH/DELETE /medications/:id`, `PATCH /medications/:medicationId/logs/:logId/status`                                    |
| Measurements       | `GET/POST /measurements`, `GET/PATCH/DELETE /measurements/:id`                                                                                         |
| Wearables          | `GET/POST /wearables`, `GET/PATCH/DELETE /wearables/:id`                                                                                               |
| Health metrics     | `GET/POST /health-metrics`, `GET /health-metrics/latest`, `GET /health-metrics/history`, `POST /health-metrics/sync`, `POST /health-metrics/demo-sync` |
| Health alerts      | `GET /health-alerts`, `GET /health-alerts/:id`, `PATCH /health-alerts/:id/acknowledge`, `PATCH /health-alerts/:id/resolve`                             |
| Alert rules        | `GET/POST /alert-rules`, `GET/PATCH/DELETE /alert-rules/:id`                                                                                           |
| Emergency contacts | `GET/POST /emergency-contacts`, `GET/PATCH/DELETE /emergency-contacts/:id`                                                                             |
| Unified history    | `GET /medical-history`; `GET /medical-records/notes`; `GET /medical-records/follow-ups`                                                                |
| Health goals       | `GET/POST /health-goals`, `GET/PATCH/DELETE /health-goals/:goalId`, `POST /health-goals/:goalId/progress`                                              |
| Emergency mode     | `GET/POST /emergency-events`, `PATCH /emergency-events/:eventId/resolve`                                                                               |
| Reports            | `GET /reports/health`, `GET /reports/health/export`                                                                                                    |

The detailed units, medication schedule/time-zone behavior, wearable ingestion,
alert rules, and value bounds are documented in
[Patient API Contract](api-contract.md) and represented in Swagger DTO schemas.

## Doctor API

Every route requires `DOCTOR`. The service first resolves the current doctor
profile and applies an active `DoctorPatientAccess` predicate to clinical data.

| Method   | Path                                          | Purpose                                                                                                  |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET      | `/doctor/dashboard`                           | Counts plus assigned patients, active alerts/medications, recent measurements, and upcoming appointments |
| GET      | `/doctor/patients`                            | Search and paginate actively assigned patients                                                           |
| GET      | `/doctor/patients/:patientId`                 | Assigned patient's bounded clinical detail; audited                                                      |
| GET      | `/doctor/alerts`                              | Assigned-patient alerts with status/severity/type filters; audited                                       |
| GET      | `/doctor/appointments`                        | Doctor's appointments whose patient assignment is still active                                           |
| GET      | `/doctor/monitoring`                          | Prioritized trend/unusual-change summary for assigned patients                                           |
| GET/POST | `/doctor/patients/:patientId/notes`           | Read or author notes for an actively assigned patient                                                    |
| PATCH    | `/doctor/patients/:patientId/notes/:noteId`   | Update a current-doctor-authored note inside the active assignment                                       |
| GET/POST | `/doctor/patients/:patientId/follow-ups`      | Read or append immutable assigned-patient follow-up records                                              |
| GET      | `/doctor/patients/:patientId/medical-history` | Read the assigned patient's unified clinical timeline                                                    |
| GET      | `/doctor/patients/:patientId/goals`           | Read assigned-patient goals and progress                                                                 |
| GET      | `/doctor/patients/:patientId/monitoring`      | Read a 7-, 30-, or 90-day assigned-patient trend report                                                  |

Revoking an assignment removes subsequent access immediately. Existing
appointments do not preserve clinical access.

## Administration API

Every route requires the current database role `ADMIN`.

| Method | Path                                      | Purpose                                                      |
| ------ | ----------------------------------------- | ------------------------------------------------------------ |
| GET    | `/admin/dashboard`                        | Account/role/status/assignment/audit summary                 |
| GET    | `/admin/roles`                            | Supported role and account-status options                    |
| GET    | `/admin/users`                            | Search/filter/paginate users                                 |
| GET    | `/admin/users/:userId`                    | User detail                                                  |
| POST   | `/admin/users`                            | Create patient, doctor, or admin account/profile             |
| PATCH  | `/admin/users/:userId`                    | Update name, role, account status, and role-specific profile |
| DELETE | `/admin/users/:userId`                    | Disable account and revoke access/sessions                   |
| GET    | `/admin/doctors`                          | Doctor directory and assignment counts                       |
| GET    | `/admin/assignments`                      | Filter/paginate current and revoked grants                   |
| POST   | `/admin/assignments`                      | Create or reactivate an explicit doctor–patient grant        |
| DELETE | `/admin/assignments/:doctorId/:patientId` | Revoke a grant                                               |
| GET    | `/admin/audit-logs`                       | Filter/paginate audit records                                |

Assignment creation accepts `{ doctorId, patientId }`. User creation accepts
identity fields, role/status, and doctor/patient-specific profile fields shown
in Swagger. Administrative mutations are audited; self-disabling and invalid
role/profile transitions are rejected.

## Notifications

Notification routes accept any authenticated role and always scope records and
push subscriptions to the current user.

| Method | Path                                                | Purpose                                           |
| ------ | --------------------------------------------------- | ------------------------------------------------- |
| GET    | `/notifications`                                    | Read recent notifications, optionally unread only |
| PATCH  | `/notifications/read-all`                           | Mark all owned notifications read                 |
| GET    | `/notifications/preferences`                        | Read owned channel/category preferences           |
| PATCH  | `/notifications/preferences`                        | Update owned channel/category preferences         |
| PATCH  | `/notifications/:notificationId/read`               | Mark one owned notification read                  |
| PATCH  | `/notifications/:notificationId/unread`             | Mark one owned notification unread                |
| GET    | `/notifications/push-public-key`                    | Read the configured public VAPID key              |
| POST   | `/notifications/push-subscriptions`                 | Register/update an owned browser push endpoint    |
| DELETE | `/notifications/push-subscriptions/:subscriptionId` | Disable an owned subscription                     |

Medication reminders and overdue notices are deduplicated per dose/window,
persisted in-app, and dispatched through configured email/web-push providers.
Provider credentials and private keys are environment-only. Delivery failure
does not expose secrets to the API response.

## Clinical exports

`GET /exports/:dataset` accepts `PATIENT`, `DOCTOR`, or `ADMIN`, with supported
datasets `medical-history`, `measurements`, `appointments`, `adherence`, and
`wearables`, and a required `format=csv|pdf`. Scope remains role-specific:
patients must not send `patientId` and export their own record; doctors must
send `patientId` and have an active assignment; administrators must explicitly
send `patientId`. Date filters use offset-qualified ISO 8601 values. Exports
set an attachment filename and `nosniff`, escape spreadsheet formula prefixes
in CSV, and contain a health-information handling notice in PDF.

## OpenAPI quality metadata

In addition to controller/DTO decorators, the generated document normalizes
every operation with a non-empty tag, summary, description, success response,
standard error descriptions, parameter descriptions, and a public, bearer, or
refresh-cookie security declaration. The `x-required-roles` extension makes
the current database roles explicit, while `x-resource-scope` documents the
ownership or active-assignment rule. The shared `ApiError` component describes
the framework error envelope. Automated E2E assertions audit these invariants
across every generated path.
