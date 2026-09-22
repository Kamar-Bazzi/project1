import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "../../components/auth/ProtectedRoute";
import { PreferencesProvider } from "../../preferences";
import { authService, type AuthenticatedUser } from "../../services/auth.service";
import { doctorService } from "../../services/doctor.service";
import type {
  DoctorAvailability,
  DoctorDashboard,
  DoctorMonitoring,
  DoctorPatient,
  DoctorPatientDetail,
} from "../../types/doctor";
import DoctorAvailabilityPage from "./DoctorAvailabilityPage";
import DoctorDashboardPage from "./DoctorDashboardPage";
import DoctorMonitoringPage from "./DoctorMonitoringPage";
import DoctorPatientDetailsPage from "./DoctorPatientDetailsPage";
import DoctorPatientsPage from "./DoctorPatientsPage";

vi.mock("../../components/doctor/DoctorCareNotesPanel", () => ({
  default: () => <div>Care notes panel</div>,
}));
vi.mock("../../components/doctor/DoctorDocumentsPanel", () => ({
  default: () => <div>Documents panel</div>,
}));
vi.mock("../../components/doctor/DoctorMonitoringPanel", () => ({
  default: () => <div>Monitoring panel</div>,
}));
vi.mock("../../components/doctor/PatientMonitoringPanel", () => ({
  default: () => <div>Patient monitoring panel</div>,
}));
vi.mock("../../components/doctor/DoctorPatientHistoryPanel", () => ({
  default: () => <div>Patient history panel</div>,
}));
vi.mock("../../components/doctor/FollowUpPlansPanel", () => ({
  default: () => <div>Follow-up panel</div>,
}));

vi.mock("../../services/appointment.service", () => ({
  appointmentService: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
}));
vi.mock("../../services/auth.service", () => ({
  authService: {
    me: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock("../../services/doctor.service", () => ({
  doctorService: {
    dashboard: vi.fn(),
    listPatients: vi.fn(),
    getPatient: vi.fn(),
    listAppointments: vi.fn(),
    listAlerts: vi.fn(),
    monitoring: vi.fn(),
    getAvailability: vi.fn(),
    updateAvailability: vi.fn(),
    getSymptoms: vi.fn(),
    getGoals: vi.fn(),
    getPatientCheckIns: vi.fn(),
  },
}));

function renderWithProviders(children: React.ReactElement, initialPath = "/doctor") {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    </PreferencesProvider>,
  );
}

const userBase = {
  id: "user-1",
  name: "Dana Doctor",
  email: "doctor@example.test",
  createdAt: new Date(0).toISOString(),
} satisfies Omit<AuthenticatedUser, "role">;

const patient: DoctorPatient = {
  id: "patient-1",
  dateOfBirth: "1980-01-01",
  phoneNumber: "+15551230000",
  timeZone: "UTC",
  user: { id: "patient-user-1", name: "Pat Patient", email: "pat@example.test" },
  measurements: [],
  healthAlerts: [],
  appointments: [],
  _count: {
    medications: 2,
    measurements: 0,
    healthAlerts: 0,
    appointments: 1,
  },
};

const patientDetail: DoctorPatientDetail = {
  id: patient.id,
  dateOfBirth: patient.dateOfBirth,
  phoneNumber: patient.phoneNumber,
  emergencyContact: "Alex Patient",
  timeZone: "UTC",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  user: patient.user,
  medications: [],
  measurements: [],
  healthAlerts: [],
  healthMetrics: [],
  appointments: [],
};

const dashboard: DoctorDashboard = {
  doctor: {
    id: "doctor-1",
    userId: userBase.id,
    specialization: "Cardiology",
    licenseNumber: "LIC-1",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    user: { id: userBase.id, name: userBase.name, email: userBase.email },
  },
  summary: {
    assignedPatients: 1,
    activeAlerts: 0,
    activeMedications: 2,
    upcomingAppointments: 1,
    missedMedicationDoses: 0,
    patientsNeedingAttention: 0,
  },
  patients: [patient],
  alerts: [],
  medications: [],
  measurements: [],
  appointments: [],
  recentMeasurements: [],
  wearableAlerts: [],
  missedMedicationLogs: [],
  patientsNeedingAttention: [],
};

const availability: DoctorAvailability = {
  id: "availability-1",
  userId: userBase.id,
  timeZone: "UTC",
  slotDurationMinutes: 30,
  availabilityWindows: [
    { id: "window-1", dayOfWeek: 1, startMinute: 540, endMinute: 1020 },
  ],
};

const monitoring: DoctorMonitoring = {
  doctor: { id: "doctor-1", user: { id: userBase.id, name: userBase.name, email: userBase.email } },
  period: { days: 30, from: new Date(0).toISOString(), to: new Date(0).toISOString() },
  patients: [
    {
      patient: {
        id: patient.id,
        timeZone: "UTC",
        user: patient.user,
      },
      unusualChangeCount: 0,
      unusualChanges: [],
      medicationAdherence: {
        scheduled: 1,
        taken: 1,
        missed: 0,
        skipped: 0,
        pending: 0,
        adherenceRate: 100,
        previousAdherenceRate: null,
        changePercentagePoints: null,
      },
      activeAlertCount: 0,
      urgentAlertCount: 0,
      activeEmergency: null,
      latestMeasurements: [],
    },
  ],
  generatedAt: new Date(0).toISOString(),
  disclaimer: "Clinical decision support only.",
};

beforeEach(() => {
  vi.mocked(doctorService.dashboard).mockResolvedValue(dashboard);
  vi.mocked(doctorService.listPatients).mockResolvedValue({
    items: [patient],
    pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  });
  vi.mocked(doctorService.getPatient).mockResolvedValue(patientDetail);
  vi.mocked(doctorService.listAppointments).mockResolvedValue([]);
  vi.mocked(doctorService.listAlerts).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
  });
  vi.mocked(doctorService.monitoring).mockResolvedValue(monitoring);
  vi.mocked(doctorService.getAvailability).mockResolvedValue(availability);
  vi.mocked(doctorService.updateAvailability).mockResolvedValue(availability);
  vi.mocked(doctorService.getSymptoms).mockResolvedValue([]);
  vi.mocked(doctorService.getGoals).mockResolvedValue([]);
  vi.mocked(doctorService.getPatientCheckIns).mockResolvedValue([]);
  vi.mocked(authService.logout).mockResolvedValue(undefined);
});

describe("doctor workspace", () => {
  it("renders the doctor dashboard with workspace links", async () => {
    renderWithProviders(<DoctorDashboardPage />);

    expect(await screen.findByRole("heading", { name: /welcome, dr\. dana/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /patients/i })).toHaveAttribute("href", "/doctor/patients");
    expect(doctorService.dashboard).toHaveBeenCalled();
  });

  it("renders the assigned patient list from the doctor API", async () => {
    renderWithProviders(<DoctorPatientsPage />);

    expect(await screen.findByRole("heading", { name: /assigned patients/i })).toBeInTheDocument();
    expect(screen.getByText(/pat@example\.test/i)).toBeInTheDocument();
    expect(doctorService.listPatients).toHaveBeenCalledWith(undefined);
  });

  it("renders an assigned patient detail workspace", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/doctor/patients/:patientId" element={<DoctorPatientDetailsPage />} />
      </Routes>,
      "/doctor/patients/patient-1",
    );

    expect(await screen.findByRole("heading", { name: /pat patient/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /measurements/i })).toHaveAttribute("aria-selected", "false");
    expect(doctorService.getPatient).toHaveBeenCalledWith("patient-1");
  });

  it("shows a safe message for forbidden patient access", async () => {
    vi.mocked(doctorService.getPatient).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: {} },
    });

    renderWithProviders(
      <Routes>
        <Route path="/doctor/patients/:patientId" element={<DoctorPatientDetailsPage />} />
      </Routes>,
      "/doctor/patients/other-patient",
    );

    expect(await screen.findByText(/you do not have access to this patient/i)).toBeInTheDocument();
  });

  it("loads and saves doctor availability without nested backend ids", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DoctorAvailabilityPage />);

    expect(await screen.findByDisplayValue("UTC")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save availability/i }));

    await waitFor(() => expect(doctorService.updateAvailability).toHaveBeenCalled());
    expect(doctorService.updateAvailability).toHaveBeenCalledWith({
      timeZone: "UTC",
      slotDurationMinutes: 30,
      windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    });
  });

  it("renders doctor monitoring from monitoring and alerts APIs", async () => {
    renderWithProviders(<DoctorMonitoringPage />);

    expect(await screen.findByRole("heading", { name: /assigned-patient monitoring/i })).toBeInTheDocument();
    expect(screen.getByText(/clinical decision support only/i)).toBeInTheDocument();
    expect(doctorService.monitoring).toHaveBeenCalledWith(30);
    expect(doctorService.listAlerts).toHaveBeenCalled();
  });
});

describe("doctor route protection", () => {
  function renderProtectedDoctorRoute(user: AuthenticatedUser) {
    vi.mocked(authService.me).mockResolvedValue(user);
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute allowedRoles={["DOCTOR"]} />}>
          <Route path="/doctor/patients" element={<main>Doctor patients route</main>} />
        </Route>
        <Route path="/dashboard" element={<main>Patient home</main>} />
        <Route path="/admin" element={<main>Admin home</main>} />
      </Routes>,
      "/doctor/patients",
    );
  }

  it("rejects patients from doctor routes", async () => {
    renderProtectedDoctorRoute({ ...userBase, role: "PATIENT" });

    expect(await screen.findByText(/patient home/i)).toBeInTheDocument();
  });

  it("rejects admins from doctor routes", async () => {
    renderProtectedDoctorRoute({ ...userBase, role: "ADMIN" });

    expect(await screen.findByText(/admin home/i)).toBeInTheDocument();
  });
});
