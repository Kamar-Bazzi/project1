import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider } from "../preferences";
import MeasurementsPage from "./MeasurementsPage";
import MedicationsPage from "./MedicationsPage";
import NotificationsPage from "./NotificationsPage";
import AdminDashboardPage from "./admin/AdminDashboardPage";
import DoctorDashboardPage from "./doctor/DoctorDashboardPage";
import MedicalHistoryPage from "./patient/MedicalHistoryPage";
import { adminService } from "../services/admin.service";
import { appointmentService } from "../services/appointment.service";
import { careService } from "../services/care.service";
import { doctorService } from "../services/doctor.service";
import { measurementService } from "../services/measurement.service";
import { medicationService } from "../services/medication.service";
import { notificationService } from "../services/notification.service";

vi.mock("../components/doctor/DoctorCareNotesPanel", () => ({
  default: () => <div>Care notes panel</div>,
}));
vi.mock("../components/doctor/DoctorDocumentsPanel", () => ({
  default: () => <div>Documents panel</div>,
}));
vi.mock("../components/doctor/DoctorMonitoringPanel", () => ({
  default: () => <div>Monitoring panel</div>,
}));
vi.mock("../components/doctor/PatientMonitoringPanel", () => ({
  default: () => <div>Patient monitoring panel</div>,
}));
vi.mock("../components/doctor/DoctorPatientHistoryPanel", () => ({
  default: () => <div>Patient history panel</div>,
}));
vi.mock("../components/doctor/FollowUpPlansPanel", () => ({
  default: () => <div>Follow-up panel</div>,
}));
vi.mock("../components/medications/MedicationInteractionPanel", () => ({
  default: () => <div>Interaction panel</div>,
}));
vi.mock("../components/medications/MedicationRefillPanel", () => ({
  default: () => <div>Refill panel</div>,
}));

vi.mock("../services/admin.service", () => ({
  adminService: {
    dashboard: vi.fn(),
    listUsers: vi.fn(),
    listDoctors: vi.fn(),
    listAssignments: vi.fn(),
    listAuditLogs: vi.fn(),
  },
}));
vi.mock("../services/appointment.service", () => ({
  appointmentService: {
    list: vi.fn(),
  },
}));
vi.mock("../services/care.service", () => ({
  careService: {
    medicalHistory: vi.fn(),
  },
}));
vi.mock("../services/doctor.service", () => ({
  doctorService: {
    dashboard: vi.fn(),
  },
}));
vi.mock("../services/measurement.service", () => ({
  measurementService: {
    listPage: vi.fn(),
  },
}));
vi.mock("../services/medication.service", () => ({
  medicationService: {
    list: vi.fn(),
    listPage: vi.fn(),
    interactions: vi.fn(),
  },
}));
vi.mock("../services/notification.service", () => ({
  notificationService: {
    list: vi.fn(),
    getPreferences: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    updatePreferences: vi.fn(),
    enablePush: vi.fn(),
  },
}));

function renderPage(page: React.ReactElement) {
  return render(
    <PreferencesProvider>
      <MemoryRouter>{page}</MemoryRouter>
    </PreferencesProvider>,
  );
}

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
};

beforeEach(() => {
  vi.mocked(measurementService.listPage).mockResolvedValue(emptyPage);
  vi.mocked(medicationService.listPage).mockResolvedValue({
    ...emptyPage,
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
  vi.mocked(medicationService.list).mockResolvedValue([]);
  vi.mocked(medicationService.interactions).mockResolvedValue({
    checkedAt: new Date(0).toISOString(),
    reference: {
      name: "Mock reference",
      version: "test",
      publishedAt: new Date(0).toISOString(),
      sources: [],
    },
    warnings: [],
    unmatchedMedications: [],
    disclaimer: "Test only.",
  });
  vi.mocked(notificationService.list).mockResolvedValue({
    items: [],
    unreadCount: 0,
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  });
  vi.mocked(notificationService.getPreferences).mockResolvedValue({
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
    smsEnabled: false,
    medicationReminders: true,
    appointmentReminders: true,
    healthAlerts: true,
    emergencyContactAlerts: false,
    securityAlerts: false,
    appointmentReminderHours: 24,
  });
  vi.mocked(careService.medicalHistory).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 30, total: 0, totalPages: 1 },
    summary: { total: 0, byType: {} },
    period: {
      days: 30,
      from: new Date(0).toISOString(),
      to: new Date(0).toISOString(),
    },
  });
  vi.mocked(doctorService.dashboard).mockResolvedValue({
    doctor: {
      id: "doctor-1",
      userId: "user-1",
      specialization: "Cardiology",
      licenseNumber: "LIC-1",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      user: { id: "user-1", name: "Dana Doctor", email: "doctor@example.test" },
    },
    summary: {
      assignedPatients: 0,
      activeAlerts: 0,
      activeMedications: 0,
      upcomingAppointments: 0,
      missedMedicationDoses: 0,
      patientsNeedingAttention: 0,
    },
    patients: [],
    alerts: [],
    medications: [],
    measurements: [],
    appointments: [],
    recentMeasurements: [],
    wearableAlerts: [],
    missedMedicationLogs: [],
    patientsNeedingAttention: [],
  });
  vi.mocked(adminService.dashboard).mockResolvedValue({
    summary: {
      users: 0,
      patients: 0,
      doctors: 0,
      administrators: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      disabledUsers: 0,
      activeAssignments: 0,
      upcomingAppointments: 0,
      auditEventsLast24Hours: 0,
      securityEventsLast24Hours: 0,
    },
    recentUsers: [],
    recentAuditLogs: [],
    recentSecurityActivity: [],
  });
  vi.mocked(adminService.listUsers).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
  });
  vi.mocked(adminService.listDoctors).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
  });
  vi.mocked(adminService.listAssignments).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
  });
  vi.mocked(adminService.listAuditLogs).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  });
  vi.mocked(appointmentService.list).mockResolvedValue([]);
});

describe("page smoke coverage", () => {
  it("loads patient medication, measurement, notification, and history pages with paginated responses", async () => {
    renderPage(<MedicationsPage />);
    await screen.findByRole("heading", { level: 1, name: /medications/i });
    await waitFor(() => expect(medicationService.listPage).toHaveBeenCalled());
    cleanup();

    renderPage(<MeasurementsPage />);
    await screen.findByRole("heading", { level: 1, name: /measurements/i });
    await waitFor(() => expect(measurementService.listPage).toHaveBeenCalled());
    cleanup();

    renderPage(<NotificationsPage />);
    await screen.findByRole("heading", { level: 1, name: /notification center/i });
    await waitFor(() => expect(notificationService.list).toHaveBeenCalledWith(20, false, 1, undefined));
    cleanup();

    renderPage(<MedicalHistoryPage />);
    await screen.findByRole("heading", { level: 1, name: /medical history/i });
    await waitFor(() => expect(careService.medicalHistory).toHaveBeenCalled());
  });

  it("loads doctor and admin dashboards with mocked backend responses", async () => {
    renderPage(<DoctorDashboardPage />);
    await screen.findByRole("heading", { name: /welcome, dr\. dana/i });
    expect(doctorService.dashboard).toHaveBeenCalled();
    cleanup();

    renderPage(<AdminDashboardPage />);
    await screen.findByRole("heading", { name: /caretrack operations/i });
    expect(adminService.dashboard).toHaveBeenCalled();
    expect(adminService.listAuditLogs).toHaveBeenCalled();
  });
});
