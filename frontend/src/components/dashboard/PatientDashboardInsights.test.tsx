import { render, screen } from "@testing-library/react";
import type React from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PatientCalendar,
  PatientComparisonCards,
  PatientGlobalSearch,
} from "./PatientDashboardInsights";
import { appointmentService } from "../../services/appointment.service";
import { careService } from "../../services/care.service";
import { measurementService } from "../../services/measurement.service";
import { medicationService } from "../../services/medication.service";
import type { PatientHealthReport } from "../../types/care";
import type { Medication } from "../../types/medication";

vi.mock("../../services/appointment.service", () => ({
  appointmentService: {
    list: vi.fn(),
  },
}));

vi.mock("../../services/care.service", () => ({
  careService: {
    medicalHistory: vi.fn(),
    report: vi.fn(),
  },
}));

vi.mock("../../services/measurement.service", () => ({
  measurementService: {
    listPage: vi.fn(),
  },
}));

vi.mock("../../services/medication.service", () => ({
  medicationService: {
    list: vi.fn(),
    listPage: vi.fn(),
  },
}));

const emptyPage = {
  items: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
};

function renderWidget(widget: React.ReactElement) {
  return render(<MemoryRouter>{widget}</MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(appointmentService.list).mockResolvedValue([]);
  vi.mocked(careService.medicalHistory).mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    summary: { total: 0, byType: {} },
    period: {
      days: 90,
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-09-22T00:00:00.000Z",
    },
  });
  vi.mocked(careService.report).mockResolvedValue(reportFixture());
  vi.mocked(measurementService.listPage).mockResolvedValue(emptyPage);
  vi.mocked(medicationService.list).mockResolvedValue([]);
  vi.mocked(medicationService.listPage).mockResolvedValue(emptyPage);
});

describe("patient dashboard insight widgets", () => {
  it("renders comparison cards from the health report API", async () => {
    renderWidget(<PatientComparisonCards />);

    expect(await screen.findByText("Blood Pressure")).toBeInTheDocument();
    expect(screen.getByText("+12.5%")).toBeInTheDocument();
    expect(screen.getByText(/Medication adherence:/i)).toHaveTextContent("86%");
    expect(careService.report).toHaveBeenCalledWith(30);
  });

  it("includes medication reminders from returned logs beyond today's doses", async () => {
    const medication = medicationFixture({
      logs: [
        {
          id: "log-future",
          scheduledFor: "2026-09-27T09:00:00.000Z",
          takenAt: null,
          status: "PENDING",
        },
      ],
    });
    vi.mocked(medicationService.list).mockResolvedValue([medication]);

    renderWidget(<PatientCalendar />);

    await screen.findByRole("heading", { name: /september 2026/i });
    await userEvent.click(
      screen.getByRole("button", { name: /sunday, september 27, 1 event/i }),
    );

    expect(screen.getByText("Lisinopril")).toBeInTheDocument();
    expect(screen.getByText("10 mg")).toBeInTheDocument();
    expect(medicationService.list).toHaveBeenCalled();
  });

  it("searches real service surfaces and filters visible result types", async () => {
    vi.mocked(medicationService.listPage).mockResolvedValue({
      ...emptyPage,
      items: [medicationFixture({ name: "Metformin", dosage: "500 mg" })],
    });
    vi.mocked(measurementService.listPage).mockResolvedValue({
      ...emptyPage,
      items: [
        {
          id: "measurement-1",
          type: "BLOOD_GLUCOSE",
          value: 118,
          secondaryValue: null,
          unit: "mg/dL",
          measuredAt: "2026-09-21T08:00:00.000Z",
          createdAt: "2026-09-21T08:00:00.000Z",
          updatedAt: "2026-09-21T08:00:00.000Z",
        },
      ],
    });

    renderWidget(<PatientGlobalSearch />);

    await userEvent.type(
      screen.getByLabelText(/search your care record/i),
      "met",
    );
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText("Metformin")).toBeInTheDocument();
    expect(medicationService.listPage).toHaveBeenCalledWith({
      pageSize: 50,
      search: "met",
    });

    await userEvent.click(screen.getByLabelText("Medication"));
    expect(screen.getByText(/no matching records/i)).toBeInTheDocument();
  });
});

function reportFixture(): PatientHealthReport {
  return {
    patient: {
      id: "patient-1",
      timeZone: "Asia/Beirut",
      user: { id: "user-1", name: "Patient One", email: "p@example.test" },
    },
    period: {
      days: 30,
      from: "2026-08-23T00:00:00.000Z",
      to: "2026-09-22T00:00:00.000Z",
      previousFrom: "2026-07-24T00:00:00.000Z",
    },
    generatedAt: "2026-09-22T00:00:00.000Z",
    measurements: [
      {
        type: "BLOOD_PRESSURE",
        unit: "mmHg",
        count: 4,
        latest: 128,
        latestAt: "2026-09-21T08:00:00.000Z",
        average: 126,
        minimum: 120,
        maximum: 132,
        previousAverage: 112,
        changePercent: 12.5,
        direction: "INCREASING",
        unusualChange: true,
        series: [
          { date: "2026-09-15", average: 120, minimum: 118, maximum: 122, count: 1 },
          { date: "2026-09-16", average: 122, minimum: 121, maximum: 123, count: 1 },
          { date: "2026-09-17", average: 124, minimum: 123, maximum: 125, count: 1 },
          { date: "2026-09-18", average: 126, minimum: 124, maximum: 128, count: 1 },
          { date: "2026-09-19", average: 128, minimum: 126, maximum: 130, count: 1 },
          { date: "2026-09-20", average: 130, minimum: 128, maximum: 132, count: 1 },
          { date: "2026-09-21", average: 132, minimum: 130, maximum: 134, count: 1 },
        ],
      },
    ],
    wearableMetrics: [],
    medicationAdherence: {
      scheduled: 14,
      taken: 12,
      missed: 1,
      skipped: 0,
      pending: 1,
      adherenceRate: 86,
      previousAdherenceRate: 80,
      changePercentagePoints: 6,
    },
    alerts: {
      total: 2,
      active: 1,
      urgent: 0,
      bySeverity: { info: 1, warning: 1, urgent: 0 },
    },
    appointments: { total: 1, scheduled: 1, completed: 0, cancelled: 0 },
    goals: [],
    activeEmergency: null,
    unusualChanges: [],
    disclaimer: "For testing.",
  };
}

function medicationFixture(
  overrides: Partial<Medication> = {},
): Medication {
  return {
    id: "medication-1",
    patientId: "patient-1",
    timeZone: "Asia/Beirut",
    name: "Lisinopril",
    dosage: "10 mg",
    instructions: null,
    startDate: "2026-09-01",
    endDate: null,
    status: "ACTIVE",
    schedules: [
      {
        id: "schedule-1",
        medicationId: "medication-1",
        scheduledTime: "09:00",
        frequency: "DAILY",
      },
    ],
    logs: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}
