# Patient API Contract

All routes are prefixed with `/api/v1`, require a bearer token, and are
restricted to the authenticated `PATIENT`. Patient ownership is derived from
the token; clients never send a `patientId`.

Browser clients send their IANA timezone in the `X-Time-Zone` header (for
example, `Asia/Beirut`) and include it when registering. That zone is persisted
as the patient's canonical schedule zone. For an older patient without a
stored zone, the first medication scheduling request with a valid header stores
it. An omitted header uses `UTC` for that response without locking the profile.
Later device-zone changes do not silently move dose times. A patient can
deliberately correct the canonical zone through the profile endpoint; pending
derived logs are reconciled while recorded outcomes remain intact. Medication
dates and `HH:mm` schedule times are interpreted in the canonical zone,
including daylight-saving changes.

## Patient profile

- `GET /patients/me`
- `PATCH /patients/me`

The profile resource contains `id`, `userId`, `name`, `email`, `dateOfBirth`,
`phoneNumber`, `emergencyContact`, `timeZone`, `createdAt`, and
`updatedAt`. Editable fields are `name`, `dateOfBirth`, `phoneNumber`,
`emergencyContact`, and `timeZone`. Birth dates use `YYYY-MM-DD`; blank optional
contact fields are stored as `null`.

## Medications

- `GET /medications`
- `GET /medications/:id`
- `POST /medications`
- `PATCH /medications/:id`
- `DELETE /medications/:id`
- `PATCH /medications/:medicationId/logs/:logId/status`

Medication creation accepts `name`, `dosage`, nullable `instructions`,
`startDate`, nullable `endDate`, and one or more daily `schedules`. Each
schedule contains a unique `scheduledTime` in `HH:mm` format and the literal
`frequency: "DAILY"`. Medication updates accept the same fields plus the
optional lifecycle `status`. Medication resources include their schedules and
recent dose logs plus the canonical `timeZone` used to interpret them.
`COMPLETED` and `CANCELLED` medications cannot be reactivated.
Nonexistent local clock times during a daylight-saving jump move forward by the
size of the gap; distinct daily schedules remain distinct dose records even if
they resolve to the same instant. Dose-log status is one of `PENDING`, `TAKEN`,
`MISSED`, or `SKIPPED`. Once the timezone is canonical, medication reads and
writes lazily backfill at most 30 local calendar days, never before the
medication start date or schedule creation date. Unrecorded prior-day doses become `MISSED`;
current-day doses begin as `PENDING`. A legacy profile using provisional UTC
creates only current-day pending doses and defers history until its canonical
timezone is initialized. Responses include the 30 most recent logs.

## Measurements

- `GET /measurements`
- `GET /measurements/:id`
- `POST /measurements`
- `PATCH /measurements/:id`
- `DELETE /measurements/:id`

Measurement resources contain `type`, `value`, nullable `secondaryValue`,
`unit`, `measuredAt`, and timestamps. `BLOOD_PRESSURE` requires both primary
and secondary values, requires systolic to exceed diastolic, and is the only
type that accepts `secondaryValue`. Canonical value ranges are blood pressure
40–300 / 20–200 mmHg, temperature 20–50 °C, weight 0.1–1000 kg, blood glucose
1–2000 mg/dL, heart rate 10–350 bpm, and oxygen saturation 1–100%. `measuredAt`
must be a real ISO 8601 timestamp from 1900 through now with `Z` or an explicit UTC
offset.

Successful reads and writes return resources directly. Collection routes
return arrays, and successful deletes return `204 No Content`.

## Wearable devices

- `POST /wearables`
- `GET /wearables`
- `GET /wearables/:id`
- `PATCH /wearables/:id`
- `DELETE /wearables/:id`

Only `{ "provider": "MOCK" }` can currently be connected. A custom
`deviceName` is optional. Disconnect is a soft operation so metric history is
preserved. Other provider enum values are reserved for a native companion app
or completed OAuth/provider API integration and are rejected by the web demo.

## Wearable health metrics

- `POST /health-metrics`
- `GET /health-metrics`
- `GET /health-metrics/latest`
- `GET /health-metrics/history`
- `POST /health-metrics/sync`
- `POST /health-metrics/demo-sync`

Read routes accept optional `metricType`, `from`, `to`, and `limit` filters.
Dates are ISO 8601 timestamps with `Z` or an explicit UTC offset; `limit` is
1–500. History is retained rather than replacing older readings.

Generic sync accepts `{ wearableDeviceId, measurements }`, with 1–100
normalized readings. Each reading contains `metricType`, `value`, `unit`,
`measuredAt`, and optional `secondaryValue`, `externalRecordId`, and small JSON
`metadata`. The server derives `patientId` and `source`. The response contains
`receivedCount`, `createdCount`, `duplicateCount`, `lastSyncAt`, and the newly
created `metrics`. Demo sync accepts `{ wearableDeviceId }` and uses that same
pipeline.

Canonical units are `bpm`, `count`, `km`, `kcal`, `min`, `%`, `breaths/min`,
`°C`, and `kg` according to metric type. Mock values always carry an explicit
demo/non-medical disclaimer.

## Health alerts and rules

- `GET /health-alerts`
- `GET /health-alerts/:id`
- `PATCH /health-alerts/:id/acknowledge`
- `PATCH /health-alerts/:id/resolve`
- `GET /alert-rules`
- `GET /alert-rules/:id`
- `POST /alert-rules`
- `PATCH /alert-rules/:id`
- `DELETE /alert-rules/:id`

Rules accept supported `metricType`, at least one of `minimumValue` or
`maximumValue`, `enabled`, severity, and `consecutiveReadingsRequired` from
2–100 (default 3). Alerts are non-diagnostic and use `ACTIVE`, `ACKNOWLEDGED`,
and `RESOLVED` states.

## Emergency contacts

- `POST /emergency-contacts`
- `GET /emergency-contacts`
- `GET /emergency-contacts/:id`
- `PATCH /emergency-contacts/:id`
- `DELETE /emergency-contacts/:id`

Contacts contain name, relationship, phone, optional email, and active state.
No endpoint calls emergency services. The current notification channel is
in-app only.

All IDs above are object-level authorized. A foreign patient's resource is
reported as not found. Doctor wearable endpoints remain disabled until an
active `DoctorPatientAccess` grant can be enforced.
