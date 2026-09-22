# Wellness, medication review, and document safety

This document defines the safety boundary for the patient wellness features.
It is part of the application contract: UI copy and API responses must not turn
recorded observations into diagnoses or treatment instructions.

## Wellness summary

The wellness score is a computed engagement summary, not a clinical score. It
uses recent medication logs, wearable activity and sleep records, heart-rate
records, patient-entered measurements, and existing alert state. Each indicator
exposes its time window, data coverage, and a short explanation.

- Missing data is reported as `NEEDS_DATA`; it is never scored as healthy or
  unhealthy.
- Heart-rate and measurement values are summarized descriptively. The wellness
  service does not introduce population reference ranges.
- A `REVIEW` indicator means that a recorded item or an existing alert may be
  worth reviewing. It is not a diagnosis.
- Every response includes an informational-only disclaimer.

## Medication interaction reference

Interaction checks run against a bundled, versioned reference release. Each
rule contains canonical medication concepts, conservative exact aliases, a
source URL, source version, review date, and review guidance.

- A medication name is matched only when it has one unambiguous normalized
  alias. Fuzzy or inferred matching is not allowed.
- Rules report a **possible interaction for review**. They never tell a patient
  to start, stop, skip, or change a medicine.
- Unmatched medications are returned explicitly as not covered by the current
  reference release. An empty warning list does not assert that a combination
  is safe.
- Reference updates are reviewed as code/data changes, preserve provenance,
  and receive deterministic pair-matching tests before release.

The initial reference examples link to official U.S. National Library of
Medicine DailyMed labeling. The small bundled set demonstrates the safe
architecture and is not a comprehensive interaction database.

## Clinical record access matrix

| Resource | Patient | Assigned doctor | Other doctor | Administrator |
| --- | --- | --- | --- | --- |
| Wellness, symptoms, check-ins | Own read/write | Read | No access | No clinical access |
| Follow-up plans and tasks | Own read | Authoring assigned doctor read/write | No access | No clinical access |
| Documents | Own upload/read/delete | Read/download while assignment is active | No access | No document content access |

Patient identity is derived from the authenticated session. Doctor endpoints
check an active `DoctorPatientAccess` record on every request and return a
scoped not-found response for inaccessible IDs. Sensitive operations are
written to the health audit log without filenames, notes, symptom text, file
hashes, or clinical values.

## Private document storage

Document bytes are stored under an API-only storage root using random object
keys. Storage keys and filesystem paths are never returned by the API and the
directory is not mounted into the web server.

- Uploads are size limited and restricted to supported PDF/JPEG/PNG content.
- Declared MIME type and file signature must agree.
- Every production upload is streamed to a private ClamAV daemon before any
  bytes are written to document storage. A detection rejects the upload; a
  timeout, connection failure, daemon `ERROR`, oversized reply, or malformed
  reply also blocks the upload with a temporary-unavailable response.
- Original filenames are display metadata only and are sanitized again for the
  attachment response header.
- Authorization is checked against document metadata before any byte stream is
  opened.
- Download responses use `Cache-Control: no-store`, `X-Content-Type-Options:
  nosniff`, and attachment disposition.
- The production API volume must be included in encrypted host backups in
  addition to the PostgreSQL metadata backup.
- The upload endpoint is limited to 10 requests per minute by the application
  throttler. Configured per-patient file/byte quotas and a global byte quota are
  checked transactionally against document metadata before an upload is made
  available.
- Deletion first creates an atomic database tombstone, which immediately hides
  the document from lists and downloads. File removal is idempotent, and a
  scheduled reconciler completes any deletion interrupted by a storage or
  database failure without restoring orphaned patient bytes.

Local development leaves scanning disabled unless
`DOCUMENT_MALWARE_SCAN_REQUIRED=true` is set. Production forces scanning in the
runtime even if the flag is misconfigured, and the production environment
verifier requires the flag, clamd host, port, and bounded timeout. Clamd TCP is
unauthenticated and unencrypted, so it must remain on a trusted private network
and must never be published by the edge proxy or container host.
