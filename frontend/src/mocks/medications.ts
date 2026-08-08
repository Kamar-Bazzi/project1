import type { Medication } from "../types/medication";

function scheduledForToday(scheduledTime: string): string {
  const [hours = 0, minutes = 0] = scheduledTime
    .split(":")
    .map(Number);
  const scheduledFor = new Date();

  scheduledFor.setHours(hours, minutes, 0, 0);

  return scheduledFor.toISOString();
}

function dateFromToday(dayOffset: number): string {
  const date = new Date();

  date.setDate(date.getDate() + dayOffset);
  date.setHours(0, 0, 0, 0);

  return date.toISOString();
}

export const seedMedications: Medication[] = [
  {
    id: "medication-1",
    name: "Amoxicillin",
    dosage: "500 mg",
    instructions: "Take after breakfast",
    startDate: dateFromToday(-7),
    endDate: dateFromToday(7),
    status: "ACTIVE",
    schedules: [
      {
        id: "schedule-1",
        scheduledTime: "08:00",
        frequency: "Once daily",
      },
    ],
    logs: [
      {
        id: "log-1",
        scheduledFor: scheduledForToday("08:00"),
        takenAt: null,
        status: "PENDING",
      },
    ],
  },
  {
    id: "medication-2",
    name: "Ibuprofen",
    dosage: "200 mg",
    instructions: null,
    startDate: dateFromToday(-6),
    endDate: null,
    status: "ACTIVE",
    schedules: [
      {
        id: "schedule-2",
        scheduledTime: "14:00",
        frequency: "As needed",
      },
    ],
    logs: [
      {
        id: "log-2",
        scheduledFor: scheduledForToday("14:00"),
        takenAt: new Date().toISOString(),
        status: "TAKEN",
      },
    ],
  },
  {
    id: "medication-3",
    name: "Metformin",
    dosage: "850 mg",
    instructions: "Take with food",
    startDate: dateFromToday(-24),
    endDate: dateFromToday(7),
    status: "ACTIVE",
    schedules: [
      {
        id: "schedule-3",
        scheduledTime: "10:00",
        frequency: "Once daily",
      },
    ],
    logs: [
      {
        id: "log-3",
        scheduledFor: scheduledForToday("10:00"),
        takenAt: null,
        status: "PENDING",
      },
    ],
  },
];
