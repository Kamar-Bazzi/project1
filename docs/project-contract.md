# Medical Tracking Project Contract

## User Roles

### PATIENT

- Manage personal medications
- Record personal measurements
- View personal appointments
- View personal medical history

### DOCTOR

- View assigned patients
- Review patient measurements
- Add medical notes
- Manage appointments

### ADMIN

- Manage patients
- Manage doctors
- Manage user accounts
- View audit logs

## Application Pages

### Public Pages

- LoginPage
- RegisterPage

### Patient Pages

- PatientDashboardPage
- MedicationsPage
- MeasurementsPage
- PatientProfilePage
- HealthPage
- WearablesPage

### Doctor Pages

- DoctorDashboardPage

### Admin Pages

- AdminDashboardPage

## Naming Rule

Use these exact page names in:

- Figma
- Frontend folders
- Documentation
- UML diagrams

## Wearable Health Boundary

The web client supports a development-only mock wearable. Real HealthKit and
Health Connect ingestion requires an iOS or Android companion application;
Fitbit, Garmin, Samsung, and other providers require a supported native SDK or
provider API authorization. See [Wearable Health Architecture](wearable-health.md).

Wearable health is patient-private. Doctors receive no implicit access from
their role or from the existence of an appointment. A future doctor view must
require an active, explicit `DoctorPatientAccess` assignment for every patient
and every object read.
