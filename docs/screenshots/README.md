# UI screenshot register

This directory is the evidence register for the final report. The captured
images below came from the real React production build, Nest API, and a fresh
PostgreSQL database populated only with the isolated synthetic fixture in
`../../backend/scripts/seed-screenshot-data.mjs`. Names use `Example` or
`Sample`, and email addresses use the reserved `example.test` domain.

The capture was made on **14 August 2026** from the working tree based on Git
commit **`2e49213`**. The clean Chrome profile contained no developer tools,
password-manager content, access tokens, reset links, push endpoints, real
patient information, or real session identifiers. No pixel redaction was
needed. A missing filename remains explicitly `PENDING` and cannot be mistaken
for verified visual evidence.

## Capture protocol

1. Deploy or run the final production build with synthetic patient, doctor,
   administrator, appointment, alert, medication, and measurement fixtures.
2. Use a clean browser profile. Ensure developer tools, password managers,
   browser notifications, and other personal data are not visible.
3. Capture PNG at 1440 × 900 for desktop and 390 × 844 for the selected mobile
   views. Do not crop away validation, empty, loading, or error context that the
   row is intended to demonstrate.
4. Inspect the pixels and file metadata for identifiers. Redact before commit
   if necessary and document the redaction.
5. Record the commit SHA and date in this file. Reference the stable relative
   filename from the submitted report or presentation.

## Required images

| Status   | Filename                                                               | Actor/setup                          | Captured evidence                                                                                    | Viewport   | Capture                                                |
| -------- | ---------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| CAPTURED | [`01-login.png`](01-login.png)                                         | Signed out                           | Login, password recovery, and patient registration navigation                                        | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| PENDING  | `02-registration-validation.png`                                       | Signed out                           | Safe client/server validation with no secret visible                                                 | 1440 × 900 | Not captured                                           |
| PENDING  | `03-email-verification.png`                                            | Synthetic unverified patient         | Verification state and resend action                                                                 | 1440 × 900 | Not captured                                           |
| CAPTURED | [`04-patient-dashboard.png`](04-patient-dashboard.png)                 | Maya Example, patient                | Live medication counts, wearable readings, alert state, and emergency action                         | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`05-appointments.png`](05-appointments.png)                           | Maya Example with assigned doctor    | Upcoming/completed/cancelled counts, scheduling form, and visit history section                      | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| PENDING  | `06-medication-reminders.png`                                          | Synthetic patient                    | Dedicated medication page with pending/overdue dose                                                  | 1440 × 900 | Missed-dose evidence is visible in `07` and `13`       |
| CAPTURED | [`07-notifications-preferences.png`](07-notifications-preferences.png) | Maya Example, patient                | Read/unread state plus emergency, health, missed-dose, and appointment notifications                 | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`08-medical-history.png`](08-medical-history.png)                     | Maya Example, patient                | 136-item unified timeline across all eight clinical event types                                      | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`09-health-goals.png`](09-health-goals.png)                           | Maya Example, patient                | Medication, sleep, and step goal targets with derived progress                                       | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`10-emergency-mode.png`](10-emergency-mode.png)                       | Maya Example, patient                | Active urgent-event guard, non-diagnostic wording, and emergency contacts                            | 390 × 844  | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`11-health-report.png`](11-health-report.png)                         | Maya Example, patient                | 30-day adherence summary, measurements chart, and CSV/PDF controls                                   | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`12-session-security.png`](12-session-security.png)                   | Maya Example with synthetic sessions | Verified email, active session list, and revoke controls; no session IDs shown                       | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| CAPTURED | [`13-doctor-dashboard.png`](13-doctor-dashboard.png)                   | Rowan Example, assigned doctor       | Assigned-patient scope, alerts, active medication, appointment, missed-dose, and attention summaries | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| PENDING  | `14-doctor-patient-detail.png`                                         | Synthetic assigned doctor            | Bounded patient record and clinical actions                                                          | 1440 × 900 | Not captured                                           |
| CAPTURED | [`15-admin-dashboard.png`](15-admin-dashboard.png)                     | Avery Admin                          | User/patient/doctor/assignment/status totals and recent audited activity                             | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| PENDING  | `16-admin-user-management.png`                                         | Synthetic administrator              | Account edit with role/status controls                                                               | 1440 × 900 | Not captured                                           |
| CAPTURED | [`17-admin-assignment.png`](17-admin-assignment.png)                   | Avery Admin                          | Explicit doctor-patient grant form and active access ledger with revoke control                      | 1440 × 900 | 2026-08-14 · `2e49213` + working tree                  |
| PENDING  | `18-audit-log.png`                                                     | Synthetic administrator              | Filtered audit event list with non-sensitive metadata                                                | 1440 × 900 | Recent audit evidence is visible in `15`               |
| PENDING  | `19-responsive-patient.png`                                            | Synthetic patient                    | Patient navigation and key card layout at mobile width                                               | 390 × 844  | Emergency mobile evidence is visible in `10` and `10b` |
| PENDING  | `20-access-denied.png`                                                 | Synthetic wrong-role user            | Safe unauthorized/forbidden navigation state                                                         | 1440 × 900 | Verified by automated security tests, not captured     |

## Supplementary captured views

| Status   | Filename                                                     | Evidence                                                                | Viewport   |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| CAPTURED | [`07b-notification-topics.png`](07b-notification-topics.png) | Channel toggles, topic preferences, and appointment lead time           | 1440 × 900 |
| CAPTURED | [`10b-emergency-readings.png`](10b-emergency-readings.png)   | Mobile emergency guidance and recent wearable context without diagnosis | 390 × 844  |

## Optional operational evidence

| Status   | Filename                                           | Evidence                                                                                                                 | Viewport   | Capture                               |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------- |
| CAPTURED | [`21-swagger-openapi.png`](21-swagger-openapi.png) | Generated API description, authorization control, domain tags, and secured clinical operations without supplying a token | 1440 × 900 | 2026-08-14 · `2e49213` + working tree |

Prefer the copied command output in `../backup-restore-evidence.md` over
terminal screenshots for database restoration. A deployed-host TLS scanner
image remains environment-specific and was not captured locally.

## Reproduction and validation

The seed helper refuses to run unless the target database name contains
`caretrack_screenshots`. After applying all migrations to such a database,
run the seed, start the API and built frontend preview, and execute:

```powershell
node docs\screenshots\capture-screenshots.mjs
```

The capture harness obtains access tokens through the real login endpoint,
drives a clean local Chrome instance, waits for populated page state, and
checks the PNG signature and exact dimensions before writing each file. A
second independent validation on 14 August 2026 confirmed all 15 captured
PNGs have valid signatures and the registered 1440 × 900 or 390 × 844 size.
