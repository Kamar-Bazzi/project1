# Architecture

## System context

```mermaid
flowchart LR
    Patient[Patient browser]
    Doctor[Doctor browser]
    Admin[Administrator browser]
    Edge[NGINX HTTPS gateway]
    Web[React single-page app]
    API[NestJS API]
    DB[(PostgreSQL)]
    SMTP[SMTP provider]
    Push[Web-push service]
    Backup[Checksummed backup volume]
    Offsite[Encrypted off-site storage]

    Patient -->|TLS| Edge
    Doctor -->|TLS| Edge
    Admin -->|TLS| Edge
    Edge --> Web
    Edge -->|/api/v1| API
    API --> DB
    API --> SMTP
    API --> Push
    DB --> Backup
    Backup -. operator replication .-> Offsite
```

NGINX is the only public container. PostgreSQL is restricted to an internal
Docker network. The API trusts one proxy hop only when `TRUST_PROXY=true`, so
application rate limiting uses the original client address supplied by the
managed gateway.

## Backend components

```mermaid
flowchart TB
    Controllers[REST controllers and DTO validation]
    Auth[Authentication and rotating sessions]
    Policy[Role, ownership, and assignment policy]
    Domain[Clinical and administration services]
    Notify[Notification dispatcher]
    Providers[In-app / SMTP / web-push channels]
    Audit[Audit logger]
    Prisma[Prisma data access]
    Postgres[(PostgreSQL)]

    Controllers --> Auth
    Auth --> Policy
    Policy --> Domain
    Domain --> Notify
    Notify --> Providers
    Domain --> Audit
    Auth --> Audit
    Domain --> Prisma
    Auth --> Prisma
    Audit --> Prisma
    Prisma --> Postgres
```

Controllers accept identity-neutral DTOs: a patient never chooses the
`patientId` for a patient-owned resource. Services derive it from the
authenticated user. Doctor queries require an active `DoctorPatientAccess`
row in the same database predicate as the requested patient. An appointment
does not implicitly grant clinical access.

## Authorization request flow

```mermaid
sequenceDiagram
    participant Client
    participant Edge as NGINX
    participant Guard as JWT/role guards
    participant Policy as Ownership/assignment policy
    participant DB as PostgreSQL

    Client->>Edge: HTTPS request
    Edge->>Guard: Proxied request + client address
    Guard->>Guard: Verify signature, issuer timing, expiry
    Guard->>DB: Reload user and current account state
    DB-->>Guard: Current role/status
    Guard->>Policy: Authenticated identity
    Policy->>DB: Query resource with owner/active grant predicate
    alt authorized
        DB-->>Policy: Scoped resource
        Policy-->>Client: Response
    else absent or outside scope
        DB-->>Policy: No row
        Policy-->>Client: 404 without existence disclosure
    end
```

## Data ownership invariants

| Actor   | Clinical scope                                                                             | Assignment management | Account management                        |
| ------- | ------------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------- |
| Patient | Own profile and records                                                                    | None                  | Own authentication sessions               |
| Doctor  | Patients with an active explicit grant                                                     | None                  | Own authentication sessions               |
| Admin   | Operational/account metadata; clinical access only where an endpoint explicitly permits it | Grant/revoke          | Users, doctors, roles, status, audit logs |

These invariants must be enforced in database `where` clauses, not by loading a
row first and comparing identifiers afterward. Deactivated users and revoked
assignments stop authorizing new requests immediately because the server
reloads current state.

## Deployment topology

```mermaid
flowchart LR
    Internet((Internet)) -->|80 redirect / 443 TLS| Nginx[web container]
    Nginx -->|static assets| React[compiled React]
    Nginx -->|private network| API[api container]
    API -->|internal network| DB[(database container)]
    Migrate[migration job] --> DB
    Backup[backup sidecar] --> DB
    Backup --> Volume[(backup volume)]
```

Database migrations run as a one-shot dependency before the API becomes
healthy. Deployments should be rolling or performed during a maintenance
window when a migration is not backward compatible.
