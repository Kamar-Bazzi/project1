# Wearable Health Architecture

The wearable subsystem stores provider-neutral, historical health data. The
current browser application can demonstrate the entire flow with a mock watch,
but it does not claim direct access to a physical smartwatch.

```text
Smartwatch or wearable
          ↓
Phone companion app or provider cloud API
          ↓
Normalized Health API (JWT-protected NestJS)
          ↓
PostgreSQL through Prisma
          ↓
React patient dashboard and history
```

## Browser and provider boundaries

A normal React browser application cannot directly read the complete health
stores of Apple Watch, Wear OS, Samsung Watch, Garmin, Fitbit, or similar
devices.

- Apple HealthKit access requires an iOS application with HealthKit
  entitlements and explicit user permission. An iPhone companion app would
  normalize and upload approved records.
- Android Health Connect normally requires an Android application and user
  permission. A browser cannot substitute for that application.
- Fitbit, Garmin, and comparable cloud providers generally require their own
  developer registration, OAuth authorization, scopes, token lifecycle, and
  API or webhook integration.
- Samsung and other providers must be integrated through an officially
  supported mobile SDK or provider API. Availability varies by platform and
  region.

Only `MOCK` is connectable today. `Connect Demo Watch` creates a local demo
device, and `Sync Demo Data` generates deterministic, realistic-looking test
values. Every generated record has source `MOCK`, metadata `demo: true`, and
the disclaimer **“Generated demo data; not a real medical reading.”** These
values are for development and testing only.

## Provider-neutral design

`WearableProviderAdapter` converts a provider-specific record to the common
measurement shape:

- metric type and numeric value
- canonical unit
- source timestamp
- optional provider record identifier
- optional small JSON metadata object

`WearableProviderRegistry` selects an adapter by provider. The mock adapter is
the first implementation. A real adapter should be added without changing the
database history or patient UI:

1. Complete the provider's native-app or OAuth authorization flow.
2. Keep client secrets and provider tokens on an appropriate secure backend;
   never bundle them into Vite.
3. Verify callbacks, OAuth state, scopes, and provider record ownership.
4. Normalize records through a new `WearableProviderAdapter`.
5. Register the adapter in `WearableProviderRegistry`.
6. Submit normalized records through the existing batch synchronization
   service, retaining provider record IDs for idempotency.
7. Add provider contract, token-refresh, revocation, and webhook tests.

The generic synchronization endpoint is already provider-neutral. The server
derives the patient from the current JWT and derives the source from the owned
device; neither value is trusted from the request body.

## Data model

- `WearableDevice` records a patient's provider connection and synchronization
  state. Disconnecting is a soft operation (`active = false`) so history is not
  lost.
- `HealthMetric` is append-only through the API. It stores every measurement,
  not just the latest value, and is indexed for patient/type/time history.
- `AlertRule` contains patient-selected minimum/maximum thresholds and requires
  at least two consecutive outside-range readings.
- `HealthAlert` records in-app, non-diagnostic notices and their
  active/acknowledged/resolved lifecycle.
- `EmergencyContact` is a structured, opt-in contact list. It is separate from
  the legacy free-text patient profile field.
- `DoctorPatientAccess` prepares explicit doctor-to-patient authorization.
  There is intentionally no doctor wearable endpoint until this relationship
  is checked on every request.

The migration is
`20260808171147_wearable_health_infrastructure`. It only adds enums, tables,
indexes, constraints, and ownership triggers; it does not drop existing
medical tables or records.

## Synchronization and duplicate handling

The batch endpoint accepts at most 100 readings. DTO and service validation
enforce supported metric types, canonical units, finite and plausible values,
small metadata, and real ISO 8601 timestamps with an explicit offset.

For each record, the server builds a SHA-256 fingerprint from the owned device
and provider record ID. When a provider record ID is unavailable, the
normalized type, timestamp, unit, and values form the identity. A database
unique constraint makes retries idempotent. Only newly inserted metrics are
evaluated by the alert engine, so a repeated sync cannot inflate a consecutive
reading count. Delayed historical backfill remains available for trends, but
an older row cannot create a new active alert when a newer reading supersedes
it.

## Alerts, contacts, and notifications

The alert engine describes a reading only as outside the patient's configured
range and recommends rechecking or attention. It does not diagnose a disease
or claim that a heart attack, stroke, or other event is occurring. One consumer
watch reading cannot trigger a rule because
`consecutiveReadingsRequired` is at least 2 and defaults to 3.

Patients may acknowledge and resolve their alerts. Emergency contacts are
notified only if a future outbound channel is configured, the contact is
active, and the patient explicitly enabled contact notification for that rule.
The application never calls emergency services.

The notification layer is channel-based. The current implementation supports
persisted in-app alerts only. It does not pretend to send email, SMS, or push
messages. A future email/SMS/push channel must read credentials from backend
environment variables, avoid logging message contents or secrets, and include
delivery/retry tests.

## Security controls

- All wearable, metric, alert, rule, and contact endpoints require a valid JWT
  and the `PATIENT` role.
- Patient identity comes from the current JWT user and its database profile.
- Every object query includes patient ownership; foreign and missing IDs both
  return a sanitized `404`.
- Database triggers prevent cross-patient device/metric and alert/reference
  associations.
- The global validation pipe rejects unknown body fields, including
  `patientId`.
- Global request throttling and tighter sync throttles limit abuse.
- Audit events record health-data access and state changes without recording
  measurement values, full payloads, secrets, or contact details.
- CORS uses the configured trusted frontend origin. Provider credentials never
  enter frontend source or responses.

## Development demonstration

After applying the migration and starting both applications:

1. Sign in as a patient.
2. Open `/wearables` and choose **Connect Demo Watch**.
3. Choose **Sync Demo Data**.
4. View current demo values on the dashboard and historical records at
   `/health`.
5. Configure an alert rule to test consecutive outside-range readings and use
   the in-app acknowledge/resolve actions.

The demo proves storage, synchronization, duplicate protection, alerts, and UI
states. Connecting a physical watch still requires the mobile application or
provider authorization described above.
