import type { Medication } from "../types/medication";

export const mockMedications: Medication[] = [
  {
    id: "medication-1",
    name: "Paracetamol",
    dosage: "500 mg",
    scheduledTime: "08:00 AM",
    instructions: "Take after breakfast",
    status: "TAKEN",
  },
  {
    id: "medication-2",
    name: "Vitamin D",
    dosage: "1000 IU",
    scheduledTime: "02:00 PM",
    instructions: "Take with food",
    status: "PENDING",
  },
  {
    id: "medication-3",
    name: "Amoxicillin",
    dosage: "250 mg",
    scheduledTime: "08:00 PM",
    instructions: "Take after dinner",
    status: "PENDING",
  },
];